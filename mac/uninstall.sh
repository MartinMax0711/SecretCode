#!/bin/zsh
LABEL="com.xiaowo.helper"
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.xiaowo.helper.plist"
rm -rf "$HOME/Library/Application Support/XiaoWo"
echo "（系统设置里的录屏/定位权限记录需要你自己去删）"
echo "小窝助手已经卸载干净了"
