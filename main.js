// Electron 메인 프로세스
// 역할: 맥 화면 전체를 덮는 "투명 + 클릭 통과" 오버레이 창을 띄우고,
//       callouts.json이 바뀌면 그 내용을 오버레이 화면(렌더러)에 전달한다.

const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const CALLOUTS_PATH = path.join(__dirname, 'callouts.json');
let win = null;

function createWindow() {
  // 주 모니터의 논리 좌표/크기 (레티나여도 여긴 논리 px = CSS px 기준)
  const primary = screen.getPrimaryDisplay();
  const { x, y, width, height } = primary.bounds;

  win = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,   // 배경 투명 → 맥 바탕화면이 그대로 비침
    frame: false,        // 창 테두리/타이틀바 없음
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    fullscreenable: false,
    focusable: false,    // 다른 앱의 포커스를 뺏지 않음
    enableLargerThanScreen: true, // 메뉴바 영역(y=0~33)까지 덮을 수 있게 허용
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 항상 최상단(전체화면 앱 위에도) + 모든 데스크탑 공간에 표시
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // 메뉴바가 창을 아래로 밀어내므로, 디스플레이 좌상단(0,0)에 강제로 다시 배치
  win.setBounds({ x: primary.bounds.x, y: primary.bounds.y, width, height });

  // [진단] 디스플레이 배치 + 오버레이 창이 어디에 떴는지 로그
  console.log('=== DISPLAY DIAGNOSTICS ===');
  console.log('primary.id:', primary.id, 'bounds:', JSON.stringify(primary.bounds), 'workArea:', JSON.stringify(primary.workArea), 'scale:', primary.scaleFactor);
  screen.getAllDisplays().forEach((d, i) => {
    console.log(`display[${i}] id:${d.id} bounds:${JSON.stringify(d.bounds)} scale:${d.scaleFactor} ${d.id === primary.id ? '(PRIMARY)' : ''}`);
  });
  console.log('WINDOW getBounds:', JSON.stringify(win.getBounds()));
  console.log('===========================');

  // 클릭 통과: 오버레이 아래의 실제 버튼을 그대로 누를 수 있게.
  // forward:true → 마우스 "이동"은 렌더러로 전달되어 콜아웃 hover를 감지할 수 있다.
  win.setIgnoreMouseEvents(true, { forward: true });

  win.loadFile('overlay.html');

  // callouts.json을 읽어 렌더러로 전송
  function pushCallouts() {
    if (!win || win.isDestroyed()) return;
    try {
      const raw = fs.readFileSync(CALLOUTS_PATH, 'utf8');
      win.webContents.send('callouts:update', JSON.parse(raw));
    } catch (e) {
      // 파일이 아직 없거나 JSON이 깨졌으면 조용히 무시 (다음 변경 때 다시 시도)
    }
  }

  win.webContents.on('did-finish-load', pushCallouts);
  // 0.4초마다 파일 변경을 감시 (fs.watch보다 macOS에서 안정적)
  fs.watchFile(CALLOUTS_PATH, { interval: 400 }, pushCallouts);
}

// 렌더러가 "지금 마우스가 콜아웃 위에 있다"고 알리면 클릭을 받도록 토글.
// ignore=false → 콜아웃 클릭 가능 / ignore=true → 다시 화면으로 클릭 통과.
ipcMain.on('overlay:setIgnore', (_e, ignore) => {
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
