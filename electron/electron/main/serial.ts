import { SerialPort, ReadlineParser } from 'serialport'

let port: SerialPort = null
let parser: ReadlineParser = null

export function startSerialComms(ipcMain: Electron.IpcMain) {
  port = new SerialPort({ 
    path: '/dev/ttyACM0',
    baudRate: 9600 
  }, (err) => {
    if (err) {
      throw(err)
    }
  });
  port.on("open", () => {
    console.log('serial port open');
  });

  parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
  
  // Read the port data
  parser.on('data', data =>{
    receiveMessage(data)
  });

  ipcMain.handle('serial-test', (_, arg) => {
    sendMessage('TEST')
  })
}

function receiveMessage(msg: string) {
  console.log('[serial] rx', msg)
}

export function sendMessage(msg: string): boolean {
  if (!port) {
    throw(new Error('Serial port not open'))
  }
  console.log('[serial] tx', msg)
  // Sending String character by character
  msg.concat('\n').split('').forEach((char) => {
    port.write(Buffer.from(char, 'ascii'), (err) => {
      if (err) {
        console.warn('[serial] tx error', err.toString());
        return false
      }
    });
  })

  return true
}