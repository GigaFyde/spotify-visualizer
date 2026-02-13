import type { ServerWebSocket } from 'bun';

const clients = new Set<ServerWebSocket<unknown>>();

export function createBroadcaster() {
  return {
    addClient(ws: ServerWebSocket<unknown>) {
      clients.add(ws);
    },

    removeClient(ws: ServerWebSocket<unknown>) {
      clients.delete(ws);
    },

    broadcast(message: object) {
      const json = JSON.stringify(message);
      for (const ws of clients) {
        try {
          ws.send(json);
        } catch {
          clients.delete(ws);
        }
      }
    },

    broadcastBinary(data: ArrayBuffer) {
      for (const ws of clients) {
        try {
          ws.send(data);
        } catch {
          clients.delete(ws);
        }
      }
    },

    get size() {
      return clients.size;
    },
  };
}
