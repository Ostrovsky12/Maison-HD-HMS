import { WebSocket } from "ws";

// Global registry of browser clients connected to /ws/telephony
// Key: userId, Value: WebSocket
const clients = new Map<string, WebSocket>();

export function registerClient(userId: string, ws: WebSocket) {
  clients.set(userId, ws);
}

export function unregisterClient(userId: string) {
  clients.delete(userId);
}

export function getOnlinePeers(excludeId?: string): string[] {
  return [...clients.keys()].filter(k => k !== excludeId);
}

// Broadcast to ALL connected browser clients (system events from Binotel etc.)
export function broadcastToAll(event: object) {
  const payload = JSON.stringify(event);
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(payload); } catch { /* ignore */ }
    }
  });
}

// Send to a specific client
export function sendToClient(userId: string, event: object) {
  const ws = clients.get(userId);
  if (ws?.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(event)); } catch { /* ignore */ }
  }
}

export function getClientCount() {
  return clients.size;
}
