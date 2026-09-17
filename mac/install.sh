#!/bin/zsh
# 把小窝助手装成后台服务（开机自启）
set -e
SRC=${0:A:h}
APP="$HOME/Library/Application Support/XiaoWo"
PLIST="$HOME/Library/LaunchAgents/com.xiaowo.helper.plist"
LABEL="com.xiaowo.helper"

TOPIC=$(grep -o "ntfyTopic: *'[^']*'" "$SRC/../js/config.js" | sed "s/.*'\(.*\)'/\1/")
SERVER=$(grep -o "ntfyServer: *'[^']*'" "$SRC/../js/config.js" | sed "s/.*'\(.*\)'/\1/")
HER=$(grep -o "herName: *'[^']*'" "$SRC/../js/config.js" | sed "s/.*'\(.*\)'/\1/")
[[ -n "$TOPIC" ]] || { echo "没在 js/config.js 里找到 ntfyTopic"; exit 1; }

OLD_SECRET=""
[[ -f "$APP/xiaowo.conf" ]] && OLD_SECRET=$(grep -o 'SECRET=.*' "$APP/xiaowo.conf" | cut -d= -f2-)
DEFAULT_SECRET=${OLD_SECRET:-$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 8)}

echo "🎀 小窝助手安装"
echo "   频道：$TOPIC"
# 暗号可以直接当参数传：./install.sh 我们的暗号
SECRET=${1:-}
if [[ -z "$SECRET" && -t 0 ]]; then
  echo -n "   暗号（晗晗在「陪着你」里要输一次，直接回车用 $DEFAULT_SECRET）："
  read -r SECRET
fi
SECRET=${SECRET:-$DEFAULT_SECRET}

mkdir -p "$APP"
cp "$SRC"/xiaowo.sh "$SRC"/parse.js "$SRC"/notify.js "$SRC"/dialog.js "$SRC"/where.js "$APP/"
chmod +x "$APP/xiaowo.sh"
cat > "$APP/xiaowo.conf" <<CONF
SERVER=$SERVER
TOPIC=$TOPIC
HER=$HER
SECRET=$SECRET
CONF
chmod 600 "$APP/xiaowo.conf"

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>$APP/xiaowo.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>$APP/xiaowo.log</string>
  <key>StandardErrorPath</key><string>$APP/xiaowo.log</string>
</dict>
</plist>
PL

launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"

echo ""
echo "✅ 装好了。日志：$APP/xiaowo.log"
echo "   暗号：$SECRET （告诉晗晗，只输一次）"
echo ""
echo "还差两个系统权限（第一次用到时会弹窗，允许就行）："
echo "  · 通知：系统设置 › 通知 › 脚本编辑器（Script Editor）打开"
echo "  · 录屏：系统设置 › 隐私与安全性 › 屏幕录制，允许 zsh（看屏幕功能要用）"
echo ""
echo "想卸载：./uninstall.sh"
