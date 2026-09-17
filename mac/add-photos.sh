#!/bin/zsh
# 把照片放进网站相册（两个人都能看到）
# 用法：./mac/add-photos.sh ~/Desktop/合照/*.jpg
#      支持 iPhone 的 HEIC，会自动转成 jpg 并缩到 2000px
set -e
ROOT=${0:A:h}/..
OUT="$ROOT/photos"
mkdir -p "$OUT"

[[ $# -gt 0 ]] || { echo "用法：$0 照片1 照片2 ..."; exit 1; }

added=()
for f in "$@"; do
  [[ -f "$f" ]] || continue
  # 拍摄日期：优先用照片自带的，取不到就用文件修改时间
  d=$(mdls -raw -name kMDItemContentCreationDate "$f" 2>/dev/null | cut -c1-10)
  [[ "$d" == "(null)" || -z "$d" ]] && d=$(stat -f '%Sm' -t '%Y-%m-%d' "$f")
  base="$d-$(printf '%04d' $((RANDOM % 10000)))"
  sips -Z 2000 -s format jpeg -s formatOptions 80 "$f" --out "$OUT/$base.jpg" >/dev/null
  added+=("photos/$base.jpg|$d")
  echo "✓ $base.jpg  ($d)"
done

# 重新生成 data/photos.js
{
  echo "// 放在仓库里的合照（两个人都能看到）"
  echo "// 用 mac/add-photos.sh 添加会自动更新这个文件"
  echo ""
  echo "export const PHOTOS = ["
  for entry in "${added[@]}"; do
    src=${entry%%|*}; date=${entry##*|}
    echo "  { src: '$src', date: '$date', caption: '' },"
  done
  # 保留之前已经在文件里的
  if [[ -f "$ROOT/data/photos.js" ]]; then
    grep -E "^  \{ src: 'photos/" "$ROOT/data/photos.js" || true
  fi
  echo "];"
} > "$ROOT/data/photos.js.new"
mv "$ROOT/data/photos.js.new" "$ROOT/data/photos.js"

echo ""
echo "加好了 ${#added[@]} 张，写进 data/photos.js。想写文字说明就直接改那个文件的 caption。"
