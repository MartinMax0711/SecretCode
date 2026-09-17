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

// MARK: - 权限

// 录屏权限：没有的话主动弹窗要（给完要重启程序才生效）
@discardableResult
func ensureScreenAccess() -> Bool {
    if CGPreflightScreenCaptureAccess() { return true }
    return CGRequestScreenCaptureAccess()
}

// MARK: - 截屏

func captureScreen(to path: String, maxWidth: Int) async -> Bool {
    guard ensureScreenAccess() else {
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

// MARK: - 定位

final class Locator: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var finished = false
    private var result: CLLocation?

    func locate(timeout: TimeInterval) -> CLLocation? {
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
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
