#!/bin/zsh
# 小窝助手：守在这台 Mac 上，等晗晗按老公铃 / 看屏幕 / 看位置
# 用法：./xiaowo.sh          （前台跑，Ctrl+C 退出）
#      install.sh 会把它装成开机自启的后台服务

set -u
DIR=${0:A:h}
# App 包内部绝对不能写东西，否则签名会坏、录屏/定位权限就失效
APP_SUPPORT=${DIR%/XiaoWo.app/*}
[[ "$APP_SUPPORT" == "$DIR" ]] && APP_SUPPORT=$DIR
NATIVE_LOG="$APP_SUPPORT/native.log"
# 配置和脚本都在 .app 外面
for c in "$DIR/xiaowo.conf" "$APP_SUPPORT/xiaowo.conf"; do
  [[ -f "$c" ]] && source "$c" && break
done

SERVER=${SERVER:-https://ntfy.sh}
TOPIC=${TOPIC:?没有配置 TOPIC，请先跑 install.sh}
SECRET=${SECRET:-}
HER=${HER:-晗晗}

REPLY_TOPIC="$TOPIC-reply"
ASK_TOPIC="$TOPIC-ask"
SCREEN_TOPIC="$TOPIC-screen"
WHERE_TOPIC="$TOPIC-where"
CAM_TOPIC="$TOPIC-cam"
CHAT_TOPIC="$TOPIC-chat"
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

# 聊天：数晗晗连着发了几条我还没回，满 5 条就响铃
UNREAD=0
handle_chat() {
  local body=$1
  # 消息是 {"from":"her|him","text":"..."} 这种格式
  if [[ "$body" == *'"from":"him"'* ]]; then
    UNREAD=0            # 我自己回了，清零
    return
  fi
  UNREAD=$(( UNREAD + 1 ))
  local text=${body#*\"text\":\"}
  text=${text%%\"*}
  log "晗晗发消息（第 $UNREAD 条）：$text"
  if (( UNREAD == 5 )); then
    log "满 5 条没回，响铃！"
    ring &
    osascript -l JavaScript "$DIR/notify.js" "💬 ${HER}连发了 5 条消息" "快去小窝回她！" >/dev/null 2>&1
  fi
}

# 截屏 + 位置，传给晗晗
# 截屏和定位都交给 App 里的原生程序（$XIAOWO_BIN），因为 macOS 的权限只认签名过的程序
handle_peek() {
  local jpg="${TMPDIR:-/tmp}/xiaowo-screen.jpg"
  rm -f "$jpg"

  if [[ -n "${XIAOWO_BIN:-}" ]] && "$XIAOWO_BIN" --shot "$jpg" 2>>"$NATIVE_LOG" && [[ -s "$jpg" ]]; then
    curl -s -m 30 -T "$jpg" -H "Filename: screen.jpg" -H "Title: 屏幕" "$SERVER/$SCREEN_TOPIC" >/dev/null
    log "发了一张屏幕"
  else
    curl -s -m 10 -H "Title: 截屏失败" -d "电脑还没给「录屏」权限：系统设置 › 隐私与安全性 › 屏幕录制，把「小窝助手 / XiaoWo」打开" "$SERVER/$SCREEN_TOPIC" >/dev/null
    log "截屏失败（多半是没有录屏权限）"
  fi
  rm -f "$jpg"

  # 摄像头：拍一张耀耀现在的样子
  local cam="${TMPDIR:-/tmp}/xiaowo-cam.jpg"
  rm -f "$cam"
  if [[ -n "${XIAOWO_BIN:-}" ]] && "$XIAOWO_BIN" --photo "$cam" 2>>"$NATIVE_LOG" && [[ -s "$cam" ]]; then
    curl -s -m 30 -T "$cam" -H "Filename: cam.jpg" -H "Title: 摄像头" "$SERVER/$CAM_TOPIC" >/dev/null
    log "发了一张摄像头"
  else
    log "摄像头拍照失败（多半是没给摄像头权限）"
  fi
  rm -f "$cam"

  local loc battery now where
  # 先用系统定位（Wi-Fi/GPS，准），拿不到再退回 IP 定位（只能到城市，还可能被 VPN 带偏）
  [[ -n "${XIAOWO_BIN:-}" ]] && loc=$("$XIAOWO_BIN" --location 2>>"$NATIVE_LOG")
  if [[ "$loc" != *'"lat"'* ]]; then
    log "系统定位拿不到，改用 IP 定位"
    loc=$(curl -s -m 6 "http://ip-api.com/json/?fields=status,country,regionName,city,lat,lon" 2>/dev/null)
    [[ "$loc" == *'"status":"success"'* ]] || loc=$(curl -s -m 6 https://ipapi.co/json/ 2>/dev/null)
  fi
  battery=$(pmset -g batt 2>/dev/null | grep -Eo '[0-9]+%' | head -1)
  now=$(date '+%-m月%-d日 %H:%M')
  where=$(osascript -l JavaScript "$DIR/where.js" "$loc" "$battery" "$now" 2>/dev/null)
  [[ -n "$where" ]] && curl -s -m 10 -H "Title: where" -d "$where" "$SERVER/$WHERE_TOPIC" >/dev/null
  log "发了位置"
}

# 先把上一版残留的自己和它的 curl 清理掉，避免一条请求被处理好几次
for pid in ${(f)"$(pgrep -f 'XiaoWo.app/Contents/Resources/xiaowo.sh')"}; do
  [[ "$pid" == "$$" ]] && continue
  pkill -P "$pid" 2>/dev/null
  kill "$pid" 2>/dev/null
done

# 被停掉时把订阅用的 curl 一起带走
cleanup() { pkill -P "$$" curl 2>/dev/null; exit 0; }
trap cleanup TERM INT

log "小窝助手启动，守着 $TOPIC"

# 启动时一次性把录屏和定位权限申请好（授权过就静默跳过，不会反复弹窗）
[[ -n "${XIAOWO_BIN:-}" ]] && "$XIAOWO_BIN" --request 2>>"$NATIVE_LOG" &

while true; do
  curl -sN -m 0 --no-buffer "$SERVER/$TOPIC,$ASK_TOPIC,$CHAT_TOPIC/json" 2>/dev/null | while IFS= read -r line; do
    [[ "$line" == *'"event":"message"'* ]] || continue
    parsed=$(osascript -l JavaScript "$DIR/parse.js" "$line" 2>/dev/null) || continue
    topic=${parsed%%$'\x1f'*}
    rest=${parsed#*$'\x1f'}
    title=${rest%%$'\x1f'*}
    body=${rest#*$'\x1f'}

    if [[ "$topic" == "$CHAT_TOPIC" ]]; then
      handle_chat "$body"
    elif [[ "$topic" == "$ASK_TOPIC" ]]; then
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
