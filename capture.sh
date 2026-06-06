#!/bin/bash
# 맥 화면을 통째로 캡처하고, 이미지의 실제 픽셀 크기를 출력한다.
# 사용: ./capture.sh  → screen.png 저장 + "경로 너비 높이" 한 줄 출력
# (Claude Code가 이 출력으로 이미지 크기를 알고 좌표를 비율로 환산한다)

DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$DIR/screen.png}"

# -x: 캡처 효과음 끄기, -t png: PNG로 저장
screencapture -x -t png "$OUT"

W=$(sips -g pixelWidth "$OUT" 2>/dev/null | awk '/pixelWidth/{print $2}')
H=$(sips -g pixelHeight "$OUT" 2>/dev/null | awk '/pixelHeight/{print $2}')

echo "$OUT $W $H"
