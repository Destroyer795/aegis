import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type {
  AegisMessage,
  GeoHashString,
  SessionId,
} from '@aegis/geo-core';

// In-memory Pub/Sub and Connection State
export const activeConnections = new Map<SessionId, WebSocket>();
export const sessionSubscriptions = new Map<SessionId, Set<GeoHashString>>();
export const geohashSubscriptions = new Map<GeoHashString, Set<SessionId>>();

/**
 * Starts the Aegis WebSocket Pub/Sub and Signaling Server.
 *
 * @param port - Port to listen on.
 * @returns WebSocketServer instance.
 */
export function startServer(port: number): WebSocketServer {
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws: WebSocket) => {
    const sessionId: SessionId = uuidv4();
    activeConnections.set(sessionId, ws);
    sessionSubscriptions.set(sessionId, new Set());

    // 1. Send initial WELCOME message with unique session ID
    ws.send(JSON.stringify({ type: 'WELCOME', sessionId }));

    ws.on('message', (messageData) => {
      try {
        const payload = JSON.parse(messageData.toString()) as AegisMessage;

        switch (payload.type) {
          case 'SUBSCRIBE': {
            const { geohashes } = payload;
            const currentSubs = sessionSubscriptions.get(sessionId) || new Set();
            const nextSubs = new Set(geohashes);

            // Unsubscribe from geohashes no longer in the list
            for (const sub of currentSubs) {
              if (!nextSubs.has(sub)) {
                const subs = geohashSubscriptions.get(sub);
                if (subs) {
                  subs.delete(sessionId);
                  if (subs.size === 0) {
                    geohashSubscriptions.delete(sub);
                  }
                }
              }
            }

            // Subscribe to new geohashes
            for (const sub of nextSubs) {
              let subs = geohashSubscriptions.get(sub);
              if (!subs) {
                subs = new Set();
                geohashSubscriptions.set(sub, subs);
              }
              subs.add(sessionId);
            }

            sessionSubscriptions.set(sessionId, nextSubs);
            ws.send(JSON.stringify({ type: 'SUBSCRIBE_ACK', geohashes }));
            break;
          }

          case 'UNSUBSCRIBE': {
            const { geohashes } = payload;
            const currentSubs = sessionSubscriptions.get(sessionId) || new Set();

            for (const sub of geohashes) {
              currentSubs.delete(sub);
              const subs = geohashSubscriptions.get(sub);
              if (subs) {
                subs.delete(sessionId);
                if (subs.size === 0) {
                  geohashSubscriptions.delete(sub);
                }
              }
            }

            sessionSubscriptions.set(sessionId, currentSubs);
            ws.send(JSON.stringify({ type: 'UNSUBSCRIBE_ACK', geohashes }));
            break;
          }

          case 'ALERT': {
            const { geohash } = payload;
            const subscribers = geohashSubscriptions.get(geohash);

            // Relay the alert to all other subscribers of this GeoHash cell
            if (subscribers) {
              // The router is encryption-agnostic: it wraps the opaque payload
              // in a relay envelope without inspecting the message contents.
              const relayPayload = {
                type: 'ALERT_RELAY' as const,
                alert: payload,
                relayedTo: [geohash],
              };
              const rawPayload = JSON.stringify(relayPayload);

              for (const subSessionId of subscribers) {
                // Do not send the alert back to the original author
                if (subSessionId !== sessionId) {
                  const subscriberWs = activeConnections.get(subSessionId);
                  if (subscriberWs && subscriberWs.readyState === WebSocket.OPEN) {
                    subscriberWs.send(rawPayload);
                  }
                }
              }
            }

            // Send acknowledgment to the alerting client
            ws.send(JSON.stringify({ type: 'ALERT_ACK', timestamp: new Date().toISOString() }));
            break;
          }

          case 'WEBRTC_SIGNAL': {
            const { targetSessionId } = payload;
            const targetWs = activeConnections.get(targetSessionId);

            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(JSON.stringify(payload));
            } else {
              ws.send(
                JSON.stringify({
                  type: 'ERROR',
                  message: `Target peer session '${targetSessionId}' is unavailable or disconnected.`,
                }),
              );
            }
            break;
          }

          default:
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Unsupported message type' }));
        }
      } catch (err: any) {
        ws.send(JSON.stringify({ type: 'ERROR', message: err.message || 'Invalid payload format' }));
      }
    });

    // Cleanup active mappings to prevent memory leaks when client disconnects
    const cleanup = () => {
      activeConnections.delete(sessionId);
      const subs = sessionSubscriptions.get(sessionId);
      if (subs) {
        for (const sub of subs) {
          const sessions = geohashSubscriptions.get(sub);
          if (sessions) {
            sessions.delete(sessionId);
            if (sessions.size === 0) {
              geohashSubscriptions.delete(sub);
            }
          }
        }
        sessionSubscriptions.delete(sessionId);
      }
    };

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  return wss;
}

// Start the server automatically if run directly
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
  const PORT = parseInt(process.env.PORT || '8080', 10);
  startServer(PORT);
  console.log(`🛡️ Aegis Edge Router operational on ws://localhost:${PORT}`);
}
