# 콜아웃 번호 → 그 메뉴/아이콘 설명에 필요한 신호를 한 번에 수집해 출력.
# 텍스트는 label로 즉답(tier-1), 아이콘은 신호 강도에 따라 crop을 만든다(tier-2/3).
# 사용: python3 explain.py <번호>      예) python3 explain.py 37
#       python3 explain.py --region "왼쪽 도구막대"
#
# 출력(JSON): {found, n, kind, label, region, group_label, group_siblings,
#              nearest_text:{label,dist}, app_hint, tier, crop_path}
# Claude는 이 출력을 읽고, tier>=2면 crop_path 이미지를 Read해서 의미를 확정한다.

import sys
import os
import json
import math

DIR = os.path.dirname(os.path.abspath(__file__))
CALLOUTS = os.path.join(DIR, 'callouts.json')
NOW = os.path.join(DIR, 'now.png')


def load():
    return json.load(open(CALLOUTS))


def build_flat(data):
    """모든 single + group 멤버를 n -> item 으로 평탄화."""
    flat = {}
    for c in data['callouts']:
        if c.get('kind') == 'group':
            for m in c['members']:
                flat[m['n']] = {'n': m['n'], 'box': m['box'], 'label': m.get('label', ''),
                                'kind': 'text' if m.get('label') else 'icon', 'group': c}
        else:  # single
            flat[c['n']] = {'n': c['n'], 'box': c['box'], 'label': c.get('label', ''),
                            'kind': 'text' if c.get('label') else 'icon', 'group': None}
    return flat


def center(box):
    return box['x'] + box['w'] / 2, box['y'] + box['h'] / 2


def region_of(cx, cy):
    if cx < 0.1:
        return '좌측 도구막대'
    if cx > 0.78:
        return '우측 속성 패널'
    if cy < 0.16:
        return '상단 메뉴·툴바'
    return '중앙 작업 영역'


def nearest_text(box, flat, self_n):
    cx, cy = center(box)
    best, bd = None, 1e9
    for it in flat.values():
        if it['n'] == self_n or not it['label']:
            continue
        icx, icy = center(it['box'])
        d = math.hypot(cx - icx, cy - icy)
        if d < bd:
            bd, best = d, it['label']
    return best, (bd if best else None)


def group_text_siblings(item):
    if not item['group']:
        return []
    return [m['label'] for m in item['group']['members']
            if m.get('label') and m['n'] != item['n']]


def app_hint(callouts):
    hints = []
    for c in callouts:
        items = c['members'] if c.get('kind') == 'group' else [c]
        for it in items:
            if it.get('label') and it['box']['y'] < 0.03:
                hints.append(it['label'])
    return hints[:8]


def tier_of(item, siblings, nearest_dist):
    if item['kind'] == 'text':
        return 1
    if siblings or (nearest_dist is not None and nearest_dist <= 0.02):
        return 2
    return 3


def crop(box, n, pad_scale=1.5):
    import cv2
    img = cv2.imread(NOW)
    if img is None:
        return None
    H, W = img.shape[:2]
    x, y = box['x'] * W, box['y'] * H
    w, h = box['w'] * W, box['h'] * H
    pad = max(w * pad_scale, 48)
    x1, y1 = int(max(0, x - pad)), int(max(0, y - pad))
    x2, y2 = int(min(W, x + w + pad)), int(min(H, y + h + pad))
    sub = img[y1:y2, x1:x2]
    crops = os.path.join(DIR, 'crops')
    os.makedirs(crops, exist_ok=True)
    p = os.path.join(crops, f'n{n}.png')
    cv2.imwrite(p, sub)
    return p


def explain_number(n):
    data = load()
    flat = build_flat(data)
    item = flat.get(n)
    if not item:
        return {'found': False, 'n': n, 'max_n': max(flat) if flat else 0}

    cx, cy = center(item['box'])
    siblings = group_text_siblings(item)
    ntext, ndist = nearest_text(item['box'], flat, n)
    tier = tier_of(item, siblings, ndist)
    crop_path = crop(item['box'], n) if tier >= 2 else None
    if tier == 3 and crop_path is None:
        tier = 2  # crop 실패 시 강등 표시

    return {
        'found': True, 'n': n, 'kind': item['kind'], 'label': item['label'],
        'region': region_of(cx, cy),
        'group_label': item['group']['label'] if item['group'] else None,
        'group_siblings': siblings,
        'nearest_text': {'label': ntext, 'dist': round(ndist, 4) if ndist is not None else None},
        'app_hint': app_hint(data['callouts']),
        'tier': tier,
        'crop_path': crop_path,
    }


def explain_region(query):
    data = load()
    flat = build_flat(data)
    # 영역 키워드 → region_of 라벨 매칭
    table = {'왼쪽': '좌측 도구막대', '좌측': '좌측 도구막대', '도구': '좌측 도구막대',
             '오른쪽': '우측 속성 패널', '우측': '우측 속성 패널', '속성': '우측 속성 패널',
             '위': '상단 메뉴·툴바', '상단': '상단 메뉴·툴바', '메뉴': '상단 메뉴·툴바',
             '가운데': '중앙 작업 영역', '중앙': '중앙 작업 영역'}
    target = next((v for k, v in table.items() if k in query), None)
    hits = []
    for it in flat.values():
        cx, cy = center(it['box'])
        if target is None or region_of(cx, cy) == target:
            hits.append({'n': it['n'], 'label': it['label'], 'kind': it['kind']})
    hits.sort(key=lambda x: x['n'])
    return {'region': target or '전체', 'count': len(hits), 'items': hits}


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == '--region':
        out = explain_region(sys.argv[2])
    elif len(sys.argv) >= 2:
        out = explain_number(int(sys.argv[1]))
    else:
        out = {'error': 'usage: explain.py <번호>  또는  --region "영역"'}
    print(json.dumps(out, ensure_ascii=False, indent=2))
