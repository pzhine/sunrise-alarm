import { ipcMain } from 'electron';
import { SerialPort, ReadlineParser } from 'serialport';

const MAX_RETRIES = 4;
const MESSAGE_INTERVAL = 300;

let port: SerialPort = null;
let parser: ReadlineParser = null;
const messageQueue: string[] = [];
let retryCount = 0;
let inflightMessage = null;

setInterval(processMessageQueue, MESSAGE_INTERVAL);

export function startSerialComms() {
  port = new SerialPort(
    {
      path: '/dev/ttyACM0',
      baudRate: 9600,
    },
    (err) => {
      if (err) {
        throw err;
      }
    }
  );
  port.on('open', () => {
    console.log('serial port open');
  });

  parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

  // Read the port data
  parser.on('data', (data) => {
    receive(data);
  });
}

function receive(msg: string) {
  console.log('[serial] rx', msg);
  if (!msg.startsWith('ACK')) {
    return;
  }
  const ackMessage = msg.substring(4).trim();
  const expectedMessage = inflightMessage.trim();

  // clear inflight message so we can start processing the queue again
  inflightMessage = null;

  if (ackMessage == expectedMessage) {
    // success, reset retry count
    retryCount = 0;
    console.log('[serial] sent', messageQueue);
    return;
  }
  // fail, so bump retryCount
  retryCount += 1;
  if (retryCount > MAX_RETRIES) {
    // reset the count so we can move on
    retryCount = 0;
    return;
  }
  // re-queue the message so we try again
  messageQueue.unshift(expectedMessage);
}

function transmit(msg: string): boolean {
  if (!port) {
    throw new Error('Serial port not open');
  }
  console.log('[serial] tx', msg);
  // Sending String character by character
  msg
    .concat('\n')
    .split('')
    .forEach((char) => {
      port.write(Buffer.from(char, 'ascii'), (err) => {
        if (err) {
          console.warn('[serial] tx error', err.toString());
          return false;
        }
      });
    });

  return true;
}

function processMessageQueue() {
  // empty q? do nothing
  if (!messageQueue.length) {
    return;
  }
  // message in flight? need to wait for ACK
  if (inflightMessage) {
    return;
  }
  const msg = messageQueue.shift();
  if (!transmit(msg)) {
    // if transmit fails, re-queue the message
    retryCount += 1;
    if (retryCount > MAX_RETRIES) {
      // reset the count, warn, and move on
      retryCount = 0;
      console.warn(
        '[serial] message transmit exceeded retry count, skipping',
        msg
      );
      return;
    }
    messageQueue.unshift(msg);
    return;
  }
  // transmit succeeded, set inflight msg and wait for ACK
  inflightMessage = msg;
}

export function sendMessage(msg: string) {
  messageQueue.push(msg);
  console.log('[serial] message queue', messageQueue);
}

ipcMain.handle('serial-test', (_, arg) => {
  sendMessage('TEST');
});
