#!/bin/bash
# "이 화면 설명해줘" 자동화: 지금 화면을 캡처 → OCR 검출 → 모든 옵션을 콜아웃으로 명시.
# 오버레이는 켜둔 채 실행하면 callouts.json 변경을 감지해 자동 갱신된다.

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# 1) 오버레이를 잠깐 비우고, 옛 의미 지도(index.json)도 버린다.
#    재스캔하면 번호가 새로 매겨지므로 이전 의미 지도는 더 이상 유효하지 않다.
echo '{"image":{"width":0,"height":0},"callouts":[]}' > callouts.json
rm -f index.json

# 2) 1초 뒤 현재 화면 캡처(오버레이가 비워질 시간)
# 인자로 "x,y,w,h"(대상 모니터 영역)를 받으면 그 영역만, 없으면 화면 전체를 캡처
REGION="$1"
if [ -n "$REGION" ]; then
  screencapture -x -T 1 -t png -R"$REGION" now.png
else
  screencapture -x -T 1 -t png now.png
fi

# 3) 통합 검출(텍스트+아이콘) → 4) 같은 바끼리 묶어 콜아웃으로 명시(그룹화)
PYTORCH_ENABLE_MPS_FALLBACK=1 python3 detect_combined.py now.png boxes.json
python3 group_callouts.py boxes.json callouts.json
