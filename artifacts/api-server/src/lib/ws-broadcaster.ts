import { WebSocket } from "ws";

// Global registry of browser clients connected to /ws/telephony
// Key: userId, Value: authenticated tenant-scoped connection
const clients = new Map<string, { ws: WebSocket; organizationId: number | null }>();

export function registerClient(userId: string, organizationId: number | null, ws: WebSocket) {
  clients.set(userId, { ws, organizationId });
}

export function unregisterClient(userId: string) {
  clients.delete(userId);
}

export function getOnlinePeers(excludeId?: string, organizationId?: number | null): string[] {
  return [...clients.entries()]
    .filter(([userId, client]) => userId !== excludeId && (organizationId === undefined || client.organizationId === organizationId))
    .map(([userId]) => userId);
}

// Broadcast to ALL connected browser clients (system events from Binotel etc.)
export function broadcastToAll(event: object) {
  const payload = JSON.stringify(event);
  clients.forEach(({ ws }) => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(payload); } catch { /* ignore */ }
    }
  });
}

export function broadcastToOrganization(organizationId: number, event: object) {
  const payload = JSON.stringify(event);
  clients.forEach(({ ws, organizationId: clientOrganizationId }) => {
    if (clientOrganizationId === organizationId && ws.readyState === WebSocket.OPEN) {
      try { ws.send(payload); } catch { /* ignore */ }
    }
  });
}

// Send to a specific client
export function sendToClient(userId: string, event: object, organizationId?: number | null) {
  const client = clients.get(userId);
  if (!client || (organizationId !== undefined && client.organizationId !== organizationId)) return;
  const ws = client.ws;
  if (ws?.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(event)); } catch { /* ignore */ }
  }
}

export function getClientCount() {
  return clients.size;
}
