// 오버레이 화면(렌더러): callouts.json을 받아 콜아웃 박스를 그린다.
// kind=single → 빨간 박스 + 번호 핀. kind=group → 파란 박스 + 번호 핀, 클릭 시 멤버 펼침.
// 좌표는 0~1 비율이라 화면 크기/레티나 배율과 무관하게 제자리에 뜬다.

const layer = document.getElementById('layer');
let lastData = null;

// 콜아웃 한 개의 DOM(박스 + 번호 핀 + 라벨)을 만든다. (single / group / member 공통)
function makeCallout(c, W, H) {
  const b = c.box;
  const el = document.createElement('div');
  el.className = 'callout';
  el.style.left = (b.x * W) + 'px';
  el.style.top = (b.y * H) + 'px';
  el.style.width = (b.w * W) + 'px';
  el.style.height = (b.h * H) + 'px';
  if (b.y < 0.12) el.classList.add('flip');

  const tag = document.createElement('div');
  tag.className = 'tag';
  const row = document.createElement('div');
  row.className = 'tag-row';

  const badge = document.createElement('div');
  badge.className = 'badge';
  const num = document.createElement('span');
  num.className = 'num';
  num.textContent = (c.n !== undefined && c.n !== null) ? c.n : '';
  badge.appendChild(num);

  row.appendChild(badge);
  // 라벨(이름)이 있을 때만 칩 표시. 아이콘은 이름이 없어 번호 핀만.
  if (c.label) {
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = c.label;
    row.appendChild(label);
  }
  tag.appendChild(row);

  if (c.detail) {
    const detail = document.createElement('div');
    detail.className = 'detail';
    detail.textContent = c.detail;
    tag.appendChild(detail);
  }

  el.appendChild(tag);
  el.addEventListener('mouseenter', () => window.overlayAPI.setIgnore(false));
  el.addEventListener('mouseleave', () => window.overlayAPI.setIgnore(true));
  return el;
}

function render(data) {
  lastData = data;
  layer.innerHTML = '';
  const W = window.innerWidth;
  const H = window.innerHeight;

  for (const c of (data && data.callouts) || []) {
    if (c.kind === 'group') {
      // 멤버들(개별)을 미리 만들어 두되 평소엔 숨김
      const memberEls = (c.members || []).map((m) => {
        const me = makeCallout({ box: m.box, label: m.label, n: m.n }, W, H);
        me.classList.add('member');
        me.style.display = 'none';
        layer.appendChild(me);
        return me;
      });

      // 파란 그룹 박스
      const g = makeCallout(c, W, H);
      g.classList.add('group');
      g.addEventListener('click', (e) => {
        e.stopPropagation();
        const expanded = g.classList.toggle('expanded');
        // 펼치면 멤버 표시(그룹 박스는 점선으로 남아 다시 누르면 접힘)
        memberEls.forEach((me) => { me.style.display = expanded ? '' : 'none'; });
      });
      layer.appendChild(g);
    } else {
      const el = makeCallout(c, W, H);
      el.addEventListener('click', () => el.classList.toggle('open'));
      layer.appendChild(el);
    }
  }
}

window.overlayAPI.onCallouts(render);
window.addEventListener('resize', () => { if (lastData) render(lastData); });

// 스캔 중에는 "🔍 화면 스캔 중…" 배너를 띄우고, 완료되면 지운다.
window.overlayAPI.onStatus((scanning) => {
  let banner = document.getElementById('scan-banner');
  if (scanning) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'scan-banner';
      banner.textContent = '🔍 화면 스캔 중…';
      document.body.appendChild(banner);
    }
  } else if (banner) {
    banner.remove();
  }
});
