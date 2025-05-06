import { ipcMain } from 'electron';
import { SerialPort, ReadlineParser } from 'serialport';
import { getConfig } from './configManager';

const MAX_RETRIES = 4;
const MESSAGE_INTERVAL = 300;

let port: SerialPort = null;
let parser: ReadlineParser = null;
const messageQueue: string[] = [];
let retryCount = 0;
let inflightMessage = null;
let messageQueueInterval: NodeJS.Timeout = null;

// Function to properly close serial ports
export async function closeSerialPorts(): Promise<void> {
  return new Promise((resolve) => {
    if (!port) {
      console.log('[serial] No port to close');
      resolve();
      return;
    }

    console.log('[serial] Closing port...');

    // Clear any pending message queue processing
    if (messageQueueInterval) {
      clearInterval(messageQueueInterval);
      messageQueueInterval = null;
    }

    // Clear the message queue
    messageQueue.length = 0;
    inflightMessage = null;

    // Close the port
    port.close((err) => {
      if (err) {
        console.error('[serial] Error closing port:', err);
      } else {
        console.log('[serial] Port closed successfully');
      }
      port = null;
      parser = null;
      resolve();
    });

    // If port.close doesn't respond within 2 seconds, resolve anyway
    setTimeout(() => {
      if (port) {
        console.log('[serial] Force resolving port close');
        port = null;
        parser = null;
        resolve();
      }
    }, 2000);
  });
}

messageQueueInterval = setInterval(processMessageQueue, MESSAGE_INTERVAL);

export function startSerialComms() {
  if (process.env.VITE_DEV_SERVER_URL && getConfig().arduino.mockSerialInDev) {
    console.log(
      '[serial] Skipping serial port initialization in development mode'
    );
    return; // Don't start serial in dev mode
  }
  // Don't try to open if already open
  if (port) {
    console.log('[serial] Port already open');
    return;
  }

  try {
    port = new SerialPort(
      {
        path: '/dev/ttyACM0',
        baudRate: 9600,
      },
      (err) => {
        if (err) {
          console.error('[serial] Error opening port:', err);
          port = null; // Clear the reference if opening fails
          return;
        }
      }
    );

    port.on('open', () => {
      console.log('[serial] Serial port open');
    });

    port.on('error', (err) => {
      console.error('[serial] Port error:', err);
    });

    port.on('close', () => {
      console.log('[serial] Port closed');
    });

    parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    // Read the port data
    parser.on('data', (data) => {
      receive(data);
    });
  } catch (error) {
    console.error('[serial] Failed to open serial port:', error);
    port = null;
  }
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
  if (!port) {
    console.warn('[serial] fake tx', msg);
    return; // don't fail if port is not open, just skip the message
  }
  messageQueue.push(msg);
  if (messageQueue.length > 1) {
    console.log('[serial] message queue', messageQueue);
  }
}

ipcMain.handle('serial-test', (_, arg) => {
  sendMessage('TEST');
});
