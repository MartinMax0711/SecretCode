#!/bin/zsh
# 小窝助手：守在这台 Mac 上，等晗晗按老公铃 / 看屏幕 / 看位置
# 用法：./xiaowo.sh          （前台跑，Ctrl+C 退出）
#      install.sh 会把它装成开机自启的后台服务

set -u
DIR=${0:A:h}
[[ -f "$DIR/xiaowo.conf" ]] && source "$DIR/xiaowo.conf"

SERVER=${SERVER:-https://ntfy.sh}
TOPIC=${TOPIC:?没有配置 TOPIC，请先跑 install.sh}
SECRET=${SECRET:-}
HER=${HER:-晗晗}

REPLY_TOPIC="$TOPIC-reply"
ASK_TOPIC="$TOPIC-ask"
SCREEN_TOPIC="$TOPIC-screen"
WHERE_TOPIC="$TOPIC-where"
SOUND=${SOUND:-/System/Library/Sounds/Glass.aiff}

log() { print -r -- "$(date '+%m-%d %H:%M:%S') $*"; }

# 叮铃铃：响三声
ring() {
  for _ in 1 2 3; do
    afplay "$SOUND" >/dev/null 2>&1
    sleep 0.35
  done
}

# 老公铃：弹窗 + 响铃，回答后把回复发回给晗晗
handle_bell() {
  local title=$1 message=$2
  ring &
  local answer
  answer=$(osascript -l JavaScript "$DIR/dialog.js" "$title" "$message" "$HER" "${DIALOG_TIMEOUT:-300}" 2>/dev/null)
  if [[ -n "$answer" ]]; then
    curl -s -m 10 -d "$answer" "$SERVER/$REPLY_TOPIC" >/dev/null
    log "回复了：$answer"
  fi
}

# 其它消息（道歉信已读、经期、睡觉…）：普通通知
handle_info() {
  local title=$1 message=$2
  afplay "$SOUND" >/dev/null 2>&1 &
  osascript -l JavaScript "$DIR/notify.js" "$title" "$message" >/dev/null 2>&1
}

# 截屏 + 位置，传给晗晗
handle_peek() {
  local shot="${TMPDIR:-/tmp}/xiaowo-screen.png"
  local jpg="${TMPDIR:-/tmp}/xiaowo-screen.jpg"
  rm -f "$shot" "$jpg"
  screencapture -x -C -t png "$shot" >/dev/null 2>&1
  if [[ -s "$shot" ]]; then
    sips -Z 1400 -s format jpeg -s formatOptions 62 "$shot" --out "$jpg" >/dev/null 2>&1
    [[ -s "$jpg" ]] || jpg="$shot"
    curl -s -m 30 -T "$jpg" -H "Filename: screen.jpg" -H "Title: 屏幕" "$SERVER/$SCREEN_TOPIC" >/dev/null
    log "发了一张屏幕"
  else
    curl -s -m 10 -H "Title: 截屏失败" -d "电脑还没给「录屏」权限，去 系统设置 › 隐私与安全性 › 屏幕录制 里打开" "$SERVER/$SCREEN_TOPIC" >/dev/null
    log "截屏失败（多半是没有录屏权限）"
  fi
  rm -f "$shot" "$jpg"

  local loc battery now where
  # 先用 ip-api.com（免费不限量），不行再试 ipapi.co
  loc=$(curl -s -m 6 "http://ip-api.com/json/?fields=status,country,regionName,city,lat,lon" 2>/dev/null)
  [[ "$loc" == *'"status":"success"'* ]] || loc=$(curl -s -m 6 https://ipapi.co/json/ 2>/dev/null)
  battery=$(pmset -g batt 2>/dev/null | grep -Eo '[0-9]+%' | head -1)
  now=$(date '+%-m月%-d日 %H:%M')
  where=$(osascript -l JavaScript "$DIR/where.js" "$loc" "$battery" "$now" 2>/dev/null)
  [[ -n "$where" ]] && curl -s -m 10 -H "Title: where" -d "$where" "$SERVER/$WHERE_TOPIC" >/dev/null
  log "发了位置"
}

log "小窝助手启动，守着 $TOPIC"

while true; do
  curl -sN -m 0 --no-buffer "$SERVER/$TOPIC,$ASK_TOPIC/json" 2>/dev/null | while IFS= read -r line; do
    [[ "$line" == *'"event":"message"'* ]] || continue
    parsed=$(osascript -l JavaScript "$DIR/parse.js" "$line" 2>/dev/null) || continue
    topic=${parsed%%$'\x1f'*}
    rest=${parsed#*$'\x1f'}
    title=${rest%%$'\x1f'*}
    body=${rest#*$'\x1f'}

    if [[ "$topic" == "$ASK_TOPIC" ]]; then
      if [[ -n "$SECRET" && "$body" != "$SECRET" ]]; then
        log "有人用错暗号来看屏幕，已忽略"
        continue
      fi
      handle_peek
    elif [[ "$title" == *老公铃* ]]; then
      log "老公铃！$body"
      handle_bell "$title" "$body"
    else
      log "通知：$title"
      handle_info "$title" "$body"
    fi
  done
  log "连接断了，3 秒后重连"
  sleep 3
done
