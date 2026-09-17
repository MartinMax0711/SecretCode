// 小窝助手的原生部分：截屏和定位
// 之所以要编译成 App 里的二进制，是因为 macOS 的权限（录屏、定位）只认签名过的程序，
// 不会给 shell 脚本弹窗。
//
//   XiaoWo            —— 启动小窝助手（跑 Resources/xiaowo.sh）
//   XiaoWo --shot 路径 —— 截一张图存到指定路径
//   XiaoWo --location  —— 打印当前位置的 JSON

import Foundation
import CoreLocation
import ScreenCaptureKit
import AppKit
import CoreGraphics
import AVFoundation
import CoreImage

// MARK: - 截屏

// 日常截屏只做「预检」，不弹窗——没权限就安静返回，交给上层提示晗晗。
// 主动弹窗申请只在 --check / --register 时做一次。
func captureScreen(to path: String, maxWidth: Int) async -> Bool {
    guard CGPreflightScreenCaptureAccess() else {
        FileHandle.standardError.write("没有录屏权限\n".data(using: .utf8)!)
        return false
    }
    do {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first else {
            FileHandle.standardError.write("没有找到显示器\n".data(using: .utf8)!)
            return false
        }
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let config = SCStreamConfiguration()
        let scale = min(1.0, Double(maxWidth) / Double(display.width))
        config.width = Int(Double(display.width) * scale)
        config.height = Int(Double(display.height) * scale)
        config.showsCursor = true
        config.captureResolution = .best

        let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
        let rep = NSBitmapImageRep(cgImage: image)
        guard let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.62]) else { return false }
        try data.write(to: URL(fileURLWithPath: path))
        return true
    } catch {
        FileHandle.standardError.write("截屏失败：\(error.localizedDescription)\n".data(using: .utf8)!)
        return false
    }
}

// MARK: - 摄像头拍照

final class FrameGrabber: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    private let session = AVCaptureSession()
    private var captured: CGImage?
    private var frameCount = 0
    private let done = DispatchSemaphore(value: 0)
    private let ciContext = CIContext()

    func grab(to path: String, maxWidth: Int, timeout: TimeInterval) -> Bool {
        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
            FileHandle.standardError.write("没有摄像头权限\n".data(using: .utf8)!)
            return false
        }
        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else {
            FileHandle.standardError.write("打不开摄像头\n".data(using: .utf8)!)
            return false
        }
        session.sessionPreset = .high
        session.addInput(input)
        let output = AVCaptureVideoDataOutput()
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        output.alwaysDiscardsLateVideoFrames = true
        output.setSampleBufferDelegate(self, queue: DispatchQueue(label: "cam"))
        guard session.canAddOutput(output) else { return false }
        session.addOutput(output)
        session.startRunning()
        _ = done.wait(timeout: .now() + timeout)
        session.stopRunning()

        guard let cg = captured else {
            FileHandle.standardError.write("没抓到画面\n".data(using: .utf8)!)
            return false
        }
        var image = cg
        let scale = min(1.0, Double(maxWidth) / Double(cg.width))
        if scale < 1.0 {
            let w = Int(Double(cg.width) * scale), h = Int(Double(cg.height) * scale)
            if let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                   space: CGColorSpaceCreateDeviceRGB(),
                                   bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) {
                ctx.interpolationQuality = .high
                ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
                if let scaled = ctx.makeImage() { image = scaled }
            }
        }
        let rep = NSBitmapImageRep(cgImage: image)
        guard let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.7]) else { return false }
        do { try data.write(to: URL(fileURLWithPath: path)); return true } catch { return false }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        frameCount += 1
        // 前几帧摄像头还在自动曝光，跳过，拿一张亮度正常的
        guard captured == nil, frameCount >= 8, let pb = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let ci = CIImage(cvPixelBuffer: pb)
        captured = ciContext.createCGImage(ci, from: ci.extent)
        done.signal()
    }
}

// MARK: - 定位

final class Locator: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var finished = false
    private var result: CLLocation?

    func locate(timeout: TimeInterval) -> CLLocation? {
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        // 后台助手用「始终允许」，这样授权一次以后就不再问
        if manager.authorizationStatus == .notDetermined {
            manager.requestAlwaysAuthorization()
        }
        manager.startUpdatingLocation()

        let deadline = Date().addingTimeInterval(timeout)
        while !finished && Date() < deadline {
            RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.15))
        }
        manager.stopUpdatingLocation()
        return result
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        // 等一个够准的点，太糊的先不要
        if location.horizontalAccuracy > 0 && location.horizontalAccuracy < 3000 {
            result = location
            finished = true
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        finished = true
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .denied, .restricted:
            finished = true
        case .authorized, .authorizedAlways:
            manager.startUpdatingLocation()
        default:
            break
        }
    }
}

func describe(_ location: CLLocation, timeout: TimeInterval) -> [String: Any] {
    var out: [String: Any] = [
        "lat": location.coordinate.latitude,
        "lon": location.coordinate.longitude,
        "accuracy": Int(location.horizontalAccuracy),
        "source": "gps",
    ]
    // 反查一下这是哪个城市
    var done = false
    CLGeocoder().reverseGeocodeLocation(location) { marks, _ in
        if let m = marks?.first {
            out["city"] = m.locality ?? m.subAdministrativeArea ?? ""
            out["region"] = m.administrativeArea ?? ""
            out["country"] = m.country ?? ""
            if let street = m.thoroughfare { out["street"] = street }
        }
        done = true
    }
    let deadline = Date().addingTimeInterval(timeout)
    while !done && Date() < deadline {
        RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.15))
    }
    return out
}

// MARK: - 入口

let args = CommandLine.arguments

// --request：agent 启动时调一次，把录屏、定位、摄像头权限一次性申请好（之后就静默，不再反复问）
if args.contains("--request") {
    if !CGPreflightScreenCaptureAccess() {
        CGRequestScreenCaptureAccess()   // 弹一次录屏授权
    }
    if AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined {
        let sem = DispatchSemaphore(value: 0)
        AVCaptureDevice.requestAccess(for: .video) { _ in sem.signal() }  // 弹一次摄像头授权
        _ = sem.wait(timeout: .now() + 20)
    }
    if CLLocationManager().authorizationStatus == .notDetermined {
        _ = Locator().locate(timeout: 20) // 弹一次定位授权
    }
    exit(0)
}

// --photo 路径：从摄像头拍一张
if let i = args.firstIndex(of: "--photo"), i + 1 < args.count {
    exit(FrameGrabber().grab(to: args[i + 1], maxWidth: 900, timeout: 8) ? 0 : 1)
}

// --check：把两个权限都要一遍，告诉用户现在什么状态
if args.contains("--check") {
    let screen = CGPreflightScreenCaptureAccess()
    print("录屏权限：" + (screen ? "✅ 已允许" : "❌ 还没给"))
    if !screen {
        CGRequestScreenCaptureAccess()
        print("   → 已经弹窗申请；如果没看到弹窗，去 系统设置 › 隐私与安全性 › 屏幕录制，把 XiaoWo 打开")
    }

    let manager = CLLocationManager()
    let status = manager.authorizationStatus
    let statusText: String
    switch status {
    case .notDetermined: statusText = "还没问过"
    case .restricted: statusText = "被限制"
    case .denied: statusText = "❌ 拒绝了"
    case .authorizedAlways: statusText = "✅ 已允许"
    @unknown default: statusText = "未知"
    }
    print("定位权限：" + statusText)
    if status == .notDetermined {
        let locator = Locator()
        _ = locator.locate(timeout: 12)
        print("   → 已经弹窗申请；如果没看到弹窗，去 系统设置 › 隐私与安全性 › 定位服务，把 XiaoWo 打开")
    }

    let cam = AVCaptureDevice.authorizationStatus(for: .video)
    let camText = cam == .authorized ? "✅ 已允许" : cam == .denied ? "❌ 拒绝了" : cam == .restricted ? "被限制" : "还没问过"
    print("摄像头权限：" + camText)
    if cam == .notDetermined {
        let sem = DispatchSemaphore(value: 0)
        AVCaptureDevice.requestAccess(for: .video) { _ in sem.signal() }
        _ = sem.wait(timeout: .now() + 12)
        print("   → 已经弹窗申请；如果没看到弹窗，去 系统设置 › 隐私与安全性 › 摄像头，把 XiaoWo 打开")
    }
    exit(0)
}

if args.contains("--location") {
    guard CLLocationManager.locationServicesEnabled() else {
        print("{\"error\":\"定位服务没打开\"}")
        exit(2)
    }
    let locator = Locator()
    guard let location = locator.locate(timeout: 15) else {
        print("{\"error\":\"拿不到定位（可能还没给权限）\"}")
        exit(2)
    }
    let info = describe(location, timeout: 8)
    let data = try! JSONSerialization.data(withJSONObject: info, options: [])
    print(String(data: data, encoding: .utf8)!)
    exit(0)
}

if let i = args.firstIndex(of: "--shot"), i + 1 < args.count {
    let path = args[i + 1]
    let maxWidth = 1600
    let semaphore = DispatchSemaphore(value: 0)
    var ok = false
    Task {
        ok = await captureScreen(to: path, maxWidth: maxWidth)
        semaphore.signal()
    }
    _ = semaphore.wait(timeout: .now() + 25)
    exit(ok ? 0 : 1)
}

// 默认：把主脚本跑起来
let here = URL(fileURLWithPath: args[0]).deletingLastPathComponent()          // Contents/MacOS
let script = here.deletingLastPathComponent().appendingPathComponent("Resources/xiaowo.sh")
let task = Process()
task.executableURL = URL(fileURLWithPath: "/bin/zsh")
task.arguments = [script.path]
var env = ProcessInfo.processInfo.environment
env["XIAOWO_BIN"] = args[0]
task.environment = env

// launchd 停掉我们的时候，把脚本子进程也一起结束，别留僵尸
for sig in [SIGTERM, SIGINT] {
    signal(sig, SIG_IGN)
    let src = DispatchSource.makeSignalSource(signal: sig, queue: .main)
    src.setEventHandler {
        task.terminate()
        exit(0)
    }
    src.resume()
}

try! task.run()
task.waitUntilExit()
exit(task.terminationStatus)
