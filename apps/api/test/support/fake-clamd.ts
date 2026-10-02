import { once } from 'node:events';
import { createServer, type Socket } from 'node:net';

/**
 * EICAR test string: the harmless sample every antivirus reports as infected. The fake daemon reports any content
 * that contains it.
 */
export const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

/**
 * How the fake daemon answers a scan.
 * - `scan`: `stream: OK`, or `stream: Eicar-Test-Signature FOUND` for content with EICAR.
 * - `error`: an ERROR reply, as clamd sends when the scan itself fails.
 * - `silent`: never answers.
 * - `hangup`: closes the connection without answering.
 */
export type FakeClamdMode = 'scan' | 'error' | 'silent' | 'hangup';

export interface FakeClamd {
  port: number;
  mode: FakeClamdMode;
  /** Contents received, in order, for assertions. */
  scanned: Buffer[];
  close: () => Promise<void>;
}

const COMMAND = Buffer.from('zINSTREAM\0');

/**
 * A ClamAV daemon stand-in on a random local port that speaks the INSTREAM protocol: the command, then chunks each
 * prefixed by a 4-byte big-endian length, then a zero length. Framing errors get an ERROR reply.
 */
export async function startFakeClamd(): Promise<FakeClamd> {
  const sockets = new Set<Socket>();
  const fake: FakeClamd = {
    port: 0,
    mode: 'scan',
    scanned: [],
    close: async () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      await once(server.close(), 'close');
    },
  };

  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let pending = Buffer.alloc(0);
    let commandRead = false;
    const chunks: Buffer[] = [];

    socket.on('data', (data) => {
      pending = Buffer.concat([pending, data]);
      if (!commandRead) {
        if (pending.length < COMMAND.length) {
          return;
        }
        if (!pending.subarray(0, COMMAND.length).equals(COMMAND)) {
          socket.end('UNKNOWN COMMAND\0');
          return;
        }
        commandRead = true;
        pending = pending.subarray(COMMAND.length);
      }
      while (pending.length >= 4) {
        const length = pending.readUInt32BE(0);
        if (length === 0) {
          answer(socket, Buffer.concat(chunks));
          return;
        }
        if (pending.length < 4 + length) {
          return;
        }
        chunks.push(pending.subarray(4, 4 + length));
        pending = pending.subarray(4 + length);
      }
    });
  });

  function answer(socket: Socket, content: Buffer): void {
    fake.scanned.push(content);
    switch (fake.mode) {
      case 'scan':
        socket.end(content.includes(EICAR) ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0');
        return;
      case 'error':
        socket.end('Can not allocate memory ERROR\0');
        return;
      case 'hangup':
        socket.destroy();
        return;
      case 'silent':
        return;
    }
  }

  await once(server.listen(0, '127.0.0.1'), 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('fake clamd has no TCP address');
  }
  fake.port = address.port;
  return fake;
}
