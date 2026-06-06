# easyocr(텍스트+이름) + UI-DETR(아이콘 포함 클릭 요소) 통합 검출.
# 텍스트 박스는 easyocr가 글자까지 읽어 이름 유지, UI-DETR 박스 중 텍스트와
# 겹치지 않는 것만 아이콘으로 추가. 출력은 0~1 비율 + label + kind.
# 사용: python3 detect_combined.py <screenshot.png> [boxes.json]

import sys
import json
import cv2
import easyocr
from rfdetr import RFDETRMedium

img_path = sys.argv[1]
out_path = sys.argv[2] if len(sys.argv) > 2 else 'boxes.json'

img = cv2.imread(img_path)
H, W = img.shape[:2]
img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

# 1) easyocr 텍스트 검출
reader = easyocr.Reader(['ko', 'en'], gpu=True)
texts = []
for bbox, text, conf in reader.readtext(img_path):
    xs = [p[0] for p in bbox]
    ys = [p[1] for p in bbox]
    x1, y1, x2, y2 = min(xs), min(ys), max(xs), max(ys)
    texts.append({'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2,
                  'cx': (x1 + x2) / 2, 'cy': (y1 + y2) / 2,
                  'text': text.strip(), 'conf': float(conf)})

# 2) UI-DETR 요소 검출
model = RFDETRMedium(pretrain_weights="weights-uidetr/model.pth", resolution=1600)
det = model.predict(img_rgb, threshold=0.3)
ui = []
for box, score in zip(det.xyxy, det.confidence):
    x1, y1, x2, y2 = [float(v) for v in box]
    ui.append({'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2, 'conf': float(score)})


def contains(u, t):
    return u['x1'] <= t['cx'] <= u['x2'] and u['y1'] <= t['cy'] <= u['y2']


boxes = []
# 텍스트(easyocr) — 노이즈 필터
for t in texts:
    if t['conf'] < 0.35:
        continue
    if len(t['text']) <= 1 and not t['text'].isalnum():
        continue
    boxes.append({'xRatio': t['x1'] / W, 'yRatio': t['y1'] / H,
                  'wRatio': (t['x2'] - t['x1']) / W, 'hRatio': (t['y2'] - t['y1']) / H,
                  'label': t['text'], 'kind': 'text', 'conf': round(t['conf'], 3)})

# 아이콘(UI-DETR 중 텍스트를 품지 않는 것)
icon_n = 0
for u in ui:
    if any(contains(u, t) for t in texts):
        continue
    boxes.append({'xRatio': u['x1'] / W, 'yRatio': u['y1'] / H,
                  'wRatio': (u['x2'] - u['x1']) / W, 'hRatio': (u['y2'] - u['y1']) / H,
                  'label': '', 'kind': 'icon', 'conf': round(u['conf'], 3)})
    icon_n += 1

with open(out_path, 'w') as f:
    json.dump({'image': {'width': W, 'height': H}, 'boxes': boxes}, f, ensure_ascii=False, indent=2)

nt = sum(1 for b in boxes if b['kind'] == 'text')
print(f"텍스트 {nt}개 + 아이콘 {icon_n}개 = {len(boxes)}개 → {out_path}")
