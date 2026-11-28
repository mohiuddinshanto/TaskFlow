import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../src/lib/auth';

type Client = { userId: string; socket: WebSocket };
const clients = new Set<Client>();
let webSocketServer: WebSocketServer | undefined;

export function attachRealtime(server: Server): void {
  webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', 'http://localhost');
    if (url.pathname !== '/api/realtime') {
      return;
    }
    void auth.api.getSession({ headers: fromNodeHeaders(request.headers) }).then((session) => {
      if (!session?.user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      webSocketServer?.handleUpgrade(request, socket, head, (ws) => {
        const client = { userId: session.user.id, socket: ws };
        clients.add(client);
        ws.send(JSON.stringify({ type: 'connected' }));
        ws.on('close', () => clients.delete(client));
        ws.on('error', () => clients.delete(client));
      });
    }).catch(() => socket.destroy());
  });
}

// Send only a content-free invalidation signal. Clients reload through their
// authenticated, project-scoped HTTP endpoints, which remain the source of truth.
export function broadcastDataChanged(): void {
  const message = JSON.stringify({ type: 'data_changed', at: new Date().toISOString() });
  for (const client of clients) {
    if (client.socket.readyState === WebSocket.OPEN) client.socket.send(message);
  }
}

export function closeRealtime(): Promise<void> {
  for (const client of clients) client.socket.close(1001, 'Server shutting down');
  clients.clear();
  return new Promise((resolve) => webSocketServer ? webSocketServer.close(() => resolve()) : resolve());
}
