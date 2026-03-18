import { WebSocketServer, WebSocket } from 'ws';

/**
 * Phoenix protocol message format:
 * [join_ref, ref, topic, event, payload]
 */
type PhoenixMessage = [string | null, string | null, string, string, Record<string, unknown>];

interface ConnectedClient {
  ws: WebSocket;
  topics: Set<string>;
}

export interface MockRealtimeServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  broadcast(topic: string, event: string, payload: Record<string, unknown>): void;
  getPort(): number;
  getConnectedClients(): number;
}

export function createMockRealtimeServer(port = 4001): MockRealtimeServer {
  let wss: WebSocketServer | null = null;
  const clients = new Map<WebSocket, ConnectedClient>();

  function handleMessage(ws: WebSocket, raw: string) {
    let msg: PhoenixMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    const [joinRef, ref, topic, event, _payload] = msg;
    const client = clients.get(ws);
    if (!client) return;

    switch (event) {
      case 'phx_join': {
        client.topics.add(topic);
        const reply: PhoenixMessage = [joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }];
        ws.send(JSON.stringify(reply));
        break;
      }
      case 'heartbeat': {
        const reply: PhoenixMessage = [null, ref, 'phoenix', 'phx_reply', { status: 'ok', response: {} }];
        ws.send(JSON.stringify(reply));
        break;
      }
      case 'phx_leave': {
        client.topics.delete(topic);
        const reply: PhoenixMessage = [joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }];
        ws.send(JSON.stringify(reply));
        break;
      }
      default:
        break;
    }
  }

  return {
    start() {
      return new Promise<void>((resolve, reject) => {
        wss = new WebSocketServer({ port }, () => resolve());
        wss.on('error', reject);

        wss.on('connection', (ws) => {
          clients.set(ws, { ws, topics: new Set() });

          ws.on('message', (data) => {
            handleMessage(ws, data.toString());
          });

          ws.on('close', () => {
            clients.delete(ws);
          });
        });
      });
    },

    stop() {
      return new Promise<void>((resolve) => {
        if (!wss) {
          resolve();
          return;
        }
        // Close all client connections
        for (const [ws] of clients) {
          ws.close();
        }
        clients.clear();
        wss.close(() => {
          wss = null;
          resolve();
        });
      });
    },

    broadcast(topic: string, event: string, payload: Record<string, unknown>) {
      const msg: PhoenixMessage = [null, null, topic, event, payload];
      const data = JSON.stringify(msg);
      for (const [, client] of clients) {
        if (client.topics.has(topic) && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(data);
        }
      }
    },

    getPort() {
      return port;
    },

    getConnectedClients() {
      return clients.size;
    },
  };
}
