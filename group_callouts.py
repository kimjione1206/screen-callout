# 검출된 박스(boxes.json)를 "같은 바"로 묶어 콜아웃(callouts.json)을 만든다.
# 기준(정민님 결정): 가로줄·세로줄 둘 다 / 정렬 보통 / 간격 보통 / 3개 이상.
# 그룹은 kind=group (파란 박스, 클릭 시 멤버 펼침), 나머지는 kind=single.

import sys
import json
from statistics import median

src = sys.argv[1] if len(sys.argv) > 1 else 'boxes.json'
dst = sys.argv[2] if len(sys.argv) > 2 else 'callouts.json'

data = json.load(open(src))

# detect 단계에서 이미 필터됨. label(텍스트) 또는 빈 문자열(아이콘) 모두 포함.
items = []
for b in data['boxes']:
    label = (b.get('label') or b.get('text') or '').strip()
    items.append({
        'x': b['xRatio'], 'y': b['yRatio'], 'w': b['wRatio'], 'h': b['hRatio'],
        'cx': b['xRatio'] + b['wRatio'] / 2, 'cy': b['yRatio'] + b['hRatio'] / 2,
        'label': label,
    })

if not items:
    json.dump({'image': data['image'], 'callouts': []}, open(dst, 'w'), ensure_ascii=False, indent=2)
    print('0개')
    sys.exit()

mh = median([it['h'] for it in items]) or 0.01
mw = median([it['w'] for it in items]) or 0.02

# 파라미터(보통)
Y_TOL = 0.6 * mh            # 같은 가로줄: y중심 허용 오차
X_GAP = max(2.5 * mw, 0.045)  # 가로 연속 끊기: 이보다 멀면 다른 바
X_TOL = 0.6 * mw            # 같은 세로줄: x중심 허용 오차
Y_GAP = max(2.5 * mh, 0.02)   # 세로 연속 끊기
MIN = 3                    # 최소 그룹 크기

used = [False] * len(items)
groups = []  # (kind, [idx...])


def cluster_lines(idxs, key_center, tol):
    lines = []
    for i in sorted(idxs, key=lambda i: items[i][key_center]):
        placed = False
        for ln in lines:
            if abs(items[i][key_center] - ln['c']) < tol:
                ln['idx'].append(i)
                ln['c'] = sum(items[j][key_center] for j in ln['idx']) / len(ln['idx'])
                placed = True
                break
        if not placed:
            lines.append({'c': items[i][key_center], 'idx': [i]})
    return lines


def split_runs(idxs, sort_key, start_key, size_key, gap):
    idxs = sorted(idxs, key=lambda i: items[i][sort_key])
    runs, run = [], [idxs[0]]
    for a, b in zip(idxs, idxs[1:]):
        g = items[b][start_key] - (items[a][start_key] + items[a][size_key])
        if g < gap:
            run.append(b)
        else:
            runs.append(run)
            run = [b]
    runs.append(run)
    return runs


# --- 가로 그룹화 ---
for ln in cluster_lines(range(len(items)), 'cy', Y_TOL):
    for run in split_runs(ln['idx'], 'x', 'x', 'w', X_GAP):
        if len(run) >= MIN:
            groups.append(('h', run))
            for i in run:
                used[i] = True

# --- 세로 그룹화 (남은 것) ---
remain = [i for i in range(len(items)) if not used[i]]
if remain:
    for cl in cluster_lines(remain, 'cx', X_TOL):
        for run in split_runs(cl['idx'], 'y', 'y', 'h', Y_GAP):
            if len(run) >= MIN:
                groups.append(('v', run))
                for i in run:
                    used[i] = True

# --- callouts 생성 ---
out = []
n = 1  # 모든 개별 메뉴(단독 + 그룹 멤버)에 겹치지 않는 고유 번호
PAD = 0.002
for kind, run in groups:
    xs = [items[i]['x'] for i in run]
    ys = [items[i]['y'] for i in run]
    xe = [items[i]['x'] + items[i]['w'] for i in run]
    ye = [items[i]['y'] + items[i]['h'] for i in run]
    box = {'x': min(xs) - PAD, 'y': min(ys) - PAD,
           'w': max(xe) - min(xs) + 2 * PAD, 'h': max(ye) - min(ys) + 2 * PAD}
    members = []
    for i in run:
        members.append({'n': n,
                        'box': {'x': items[i]['x'], 'y': items[i]['y'],
                                'w': items[i]['w'], 'h': items[i]['h']},
                        'label': items[i]['label']})
        n += 1
    nums = [m['n'] for m in members]
    name = f"{nums[0]}~{nums[-1]}번 · {len(run)}개"
    out.append({'n': '', 'kind': 'group', 'box': box, 'label': name, 'members': members})

for i in range(len(items)):
    if used[i]:
        continue
    out.append({'n': n, 'kind': 'single',
                'box': {'x': items[i]['x'], 'y': items[i]['y'], 'w': items[i]['w'], 'h': items[i]['h']},
                'label': items[i]['label']})
    n += 1

json.dump({'image': data['image'], 'callouts': out}, open(dst, 'w'), ensure_ascii=False, indent=2)
ng = sum(1 for c in out if c['kind'] == 'group')
ns = sum(1 for c in out if c['kind'] == 'single')
print(f"그룹 {ng}개 + 단독 {ns}개 (원본 {len(items)}개)")
