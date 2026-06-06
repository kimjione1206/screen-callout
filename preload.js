// 메인 프로세스와 오버레이 화면(렌더러) 사이의 안전한 다리.
// 렌더러는 window.overlayAPI 만 쓸 수 있고, 직접 시스템에 접근하지 못한다.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayAPI', {
  // callouts.json이 갱신될 때마다 콜백으로 데이터 전달
  onCallouts: (cb) => ipcRenderer.on('callouts:update', (_e, data) => cb(data)),
  // 마우스가 콜아웃 위/밖일 때 클릭 통과 여부를 메인에 알림
  setIgnore: (ignore) => ipcRenderer.send('overlay:setIgnore', ignore),
});
