#!/bin/zsh
# 把小窝助手装成开机自启的后台 App
# 用法：./install.sh [暗号]
set -e
SRC=${0:A:h}
APP_DIR="$HOME/Library/Application Support/XiaoWo"
APP="$APP_DIR/XiaoWo.app"
PLIST="$HOME/Library/LaunchAgents/com.xiaowo.helper.plist"
LABEL="com.xiaowo.helper"

TOPIC=$(grep -o "ntfyTopic: *'[^']*'" "$SRC/../js/config.js" | sed "s/.*'\(.*\)'/\1/")
SERVER=$(grep -o "ntfyServer: *'[^']*'" "$SRC/../js/config.js" | sed "s/.*'\(.*\)'/\1/")
HER=$(grep -o "herName: *'[^']*'" "$SRC/../js/config.js" | sed "s/.*'\(.*\)'/\1/")
[[ -n "$TOPIC" ]] || { echo "没在 js/config.js 里找到 ntfyTopic"; exit 1; }

OLD_SECRET=""
[[ -f "$APP_DIR/xiaowo.conf" ]] && OLD_SECRET=$(grep -o 'SECRET=.*' "$APP_DIR/xiaowo.conf" | cut -d= -f2-)
DEFAULT_SECRET=${OLD_SECRET:-$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 8)}

echo "🎀 小窝助手安装"
echo "   频道：$TOPIC"

SECRET=${1:-}
if [[ -z "$SECRET" && -t 0 ]]; then
  echo -n "   暗号（晗晗在「陪着你」里要输一次，直接回车用 $DEFAULT_SECRET）："
  read -r SECRET
fi
SECRET=${SECRET:-$DEFAULT_SECRET}

echo "   编译原生程序（截屏 + 定位）…"
command -v swiftc >/dev/null || { echo "❌ 没装 Xcode 命令行工具，先跑：xcode-select --install"; exit 1; }

# 组装 App：macOS 的录屏和定位权限只认签名过的 App，不给 shell 脚本弹窗
# 脚本一律放在 .app 外面：改脚本不用重新签名，系统授权就不会失效
mkdir -p "$APP_DIR"
cp "$SRC"/xiaowo.sh "$SRC"/parse.js "$SRC"/notify.js "$SRC"/dialog.js "$SRC"/where.js "$APP_DIR/"
chmod +x "$APP_DIR/xiaowo.sh"

cat > "$APP_DIR/xiaowo.conf" <<CONF
SERVER=$SERVER
TOPIC=$TOPIC
HER=$HER
SECRET=$SECRET
CONF
chmod 600 "$APP_DIR/xiaowo.conf"

# App 包里只有二进制和 Info.plist，内容固定，签名才稳定
if [[ -x "$APP/Contents/MacOS/XiaoWo" ]] && [[ "$SRC/XiaoWoHelper.swift" -ot "$APP/Contents/MacOS/XiaoWo" ]]; then
  echo "   原生程序没变，跳过编译（保住已有授权）"
else
  rm -rf "$APP"
  mkdir -p "$APP/Contents/MacOS"
  swiftc -O -o "$APP/Contents/MacOS/XiaoWo" "$SRC/XiaoWoHelper.swift" 2>&1 | grep -E "error:" && { echo "❌ 编译失败"; exit 1; } || true
  cp "$SRC/Info.plist" "$APP/Contents/Info.plist"
  codesign --force --sign - --identifier com.xiaowo.helper "$APP" >/dev/null 2>&1 || echo "（签名跳过了）"
  echo "   ⚠️ 原生程序重新编译了，录屏/摄像头/定位可能需要重新授权一次"
fi

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$APP/Contents/MacOS/XiaoWo</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>$APP_DIR/xiaowo.log</string>
  <key>StandardErrorPath</key><string>$APP_DIR/xiaowo.log</string>
</dict>
</plist>
PL

launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"

echo ""
echo "✅ 装好了：$APP"
echo "   日志：$APP_DIR/xiaowo.log"
echo "   暗号：$SECRET （告诉晗晗，只输一次）"
echo ""
echo "第一次用「看一眼」会弹两个权限窗，允许就行："
echo "  · 屏幕录制（看屏幕用）· 定位（看位置用）"
echo "  没弹窗的话去：系统设置 › 隐私与安全性 › 屏幕录制 / 定位服务，把 XiaoWo 打开"
echo ""
echo "卸载：./uninstall.sh"
