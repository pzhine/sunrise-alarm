
window.ipcRenderer.on('main-process-message', (_event, ...args) => {
  console.log('[Receive Main-process message]:', ...args)
})

export function openNewWindow() {
  console.log('openNewWindow')
  window.ipcRenderer.invoke('open-win')
}

export function sendSerialTest() {
  console.log('sendSerialTest')
  window.ipcRenderer.invoke('serial-test')
}