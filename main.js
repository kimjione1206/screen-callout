// Electron 메인 프로세스
// 역할: 맥 화면 전체를 덮는 "투명 + 클릭 통과" 오버레이 창을 띄우고,
//       callouts.json이 바뀌면 그 내용을 오버레이 화면(렌더러)에 전달한다.

const { app, BrowserWindow, screen, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

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
      backgroundThrottling: false, // 포커스 없는 오버레이도 타이머/IPC를 정상 처리
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

// Option+2: 오버레이 표시+클릭을 한 번에 일시정지/재개 (창을 숨기면 둘 다 멈춤)
function toggleOverlay() {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) win.hide();
  else win.showInactive(); // 포커스를 뺏지 않고 다시 표시
}

// Option+1: 마우스가 있는 모니터를 새로 스캔 → 번호 오버레이 재생성
function rescan() {
  if (!win || win.isDestroyed()) return;
  // 마우스 커서가 있는 디스플레이를 대상으로 (듀얼 모니터 대응)
  const disp = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = disp.bounds;
  // 오버레이를 그 모니터로 옮기고, 숨겨져 있었다면 다시 표시
  win.setBounds({ x, y, width, height });
  if (!win.isVisible()) win.showInactive();
  // scan.sh는 약 1초 뒤 now.png를 캡처한다. 배너가 그 캡처에 찍혀 콜아웃으로
  // 오염되지 않도록, 캡처가 끝난 뒤(1.5초)에 "스캔 중" 배너를 켠다.
  setTimeout(() => {
    if (win && !win.isDestroyed()) win.webContents.send('overlay:status', true);
  }, 1500);
  // 그 모니터 영역만 캡처하도록 scan.sh 실행 (영역을 x,y,w,h 인자로 전달)
  const p = spawn('bash', [path.join(__dirname, 'scan.sh'), `${x},${y},${width},${height}`], { cwd: __dirname });
  p.on('exit', (code) => {
    console.log('scan.sh 종료 코드:', code);
    if (win && !win.isDestroyed()) win.webContents.send('overlay:status', false);
  });
}

app.whenReady().then(() => {
  createWindow();
  const okScan = globalShortcut.register('Alt+1', rescan);       // Option+1 = 재스캔/재생성
  const okToggle = globalShortcut.register('Alt+2', toggleOverlay); // Option+2 = 표시/클릭 토글
  console.log('단축키 등록 → Option+1(재스캔):', okScan, '/ Option+2(표시토글):', okToggle);
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
