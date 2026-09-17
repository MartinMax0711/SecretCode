#!/bin/zsh
LABEL="com.xiaowo.helper"
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.xiaowo.helper.plist"
rm -rf "$HOME/Library/Application Support/XiaoWo"
echo "小窝助手已经卸载干净了"
