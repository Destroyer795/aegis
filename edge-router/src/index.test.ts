import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { startServer, activeConnections, sessionSubscriptions, geohashSubscriptions } from './index';
import type { AlertBroadcastPayload, AegisMessage } from '@aegis/geo-core';
import { AlertSeverity } from '@aegis/geo-core';

const PORT = 8085;
const WS_URL = `ws://localhost:${PORT}`;

describe('Aegis WebSocket Pub/Sub Server', () => {
  let server: WebSocketServer;

  beforeAll(() => {
    // Force test environment to prevent auto-start
    process.env.NODE_ENV = 'test';
    server = startServer(PORT);
  });

  afterAll(() => {
    server.close();
  });

  // Helper to create client connection and wait for welcome message
  const connectClient = (): Promise<{ ws: WebSocket; sessionId: string }> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      ws.on('open', () => {});
      ws.on('message', (data) => {
        const payload = JSON.parse(data.toString());
        if (payload.type === 'WELCOME') {
          resolve({ ws, sessionId: payload.sessionId });
        }
      });
      ws.on('error', reject);
    });
  };

  it('should accept connection and issue a unique sessionId', async () => {
    const { ws, sessionId } = await connectClient();
    expect(sessionId).toBeDefined();
    expect(typeof sessionId).toBe('string');
    expect(activeConnections.has(sessionId)).toBe(true);

    ws.close();
  });

  it('should manage subscriptions and route alerts to matching subscribers', async () => {
    const clientA = await connectClient();
    const clientB = await connectClient();
    const clientC = await connectClient(); // Non-subscriber

    const subCells = ['9q8yyk', '9q8yye'];

    // 1. Subscribe A and B to '9q8yyk'
    await new Promise<void>((resolve) => {
      clientA.ws.send(
        JSON.stringify({
          type: 'SUBSCRIBE',
          geohashes: subCells,
          sessionId: clientA.sessionId,
        }),
      );
      clientA.ws.once('message', (data) => {
        const payload = JSON.parse(data.toString());
        expect(payload.type).toBe('SUBSCRIBE_ACK');
        resolve();
      });
    });

    await new Promise<void>((resolve) => {
      clientB.ws.send(
        JSON.stringify({
          type: 'SUBSCRIBE',
          geohashes: ['9q8yyk'],
          sessionId: clientB.sessionId,
        }),
      );
      clientB.ws.once('message', (data) => {
        const payload = JSON.parse(data.toString());
        expect(payload.type).toBe('SUBSCRIBE_ACK');
        resolve();
      });
    });

    // Subscribe C to a different cell
    await new Promise<void>((resolve) => {
      clientC.ws.send(
        JSON.stringify({
          type: 'SUBSCRIBE',
          geohashes: ['9q8yyz'],
          sessionId: clientC.sessionId,
        }),
      );
      clientC.ws.once('message', () => resolve());
    });

    expect(geohashSubscriptions.get('9q8yyk')?.has(clientA.sessionId)).toBe(true);
    expect(geohashSubscriptions.get('9q8yyk')?.has(clientB.sessionId)).toBe(true);
    expect(geohashSubscriptions.get('9q8yyz')?.has(clientC.sessionId)).toBe(true);

    // 2. Client A broadcasts alert to '9q8yyk'
    const alert: AlertBroadcastPayload = {
      type: 'ALERT',
      geohash: '9q8yyk',
      severity: AlertSeverity.CRITICAL,
      message: 'Water pipe leak near central park!',
      timestamp: new Date().toISOString(),
      originSessionId: clientA.sessionId,
    };

    const clientBReceivedAlertPromise = new Promise<void>((resolve) => {
      clientB.ws.on('message', (data) => {
        const payload = JSON.parse(data.toString());
        if (payload.type === 'ALERT_RELAY') {
          expect(payload.alert.message).toBe(alert.message);
          expect(payload.relayedTo).toContain('9q8yyk');
          resolve();
        }
      });
    });

    // Set up check for client C to ensure it NEVER receives the alert
    let clientCReceivedAlert = false;
    clientC.ws.on('message', (data) => {
      const payload = JSON.parse(data.toString());
      if (payload.type === 'ALERT_RELAY') {
        clientCReceivedAlert = true;
      }
    });

    // Client A sends alert
    clientA.ws.send(JSON.stringify(alert));

    // Wait for Client A to get ALERT_ACK
    await new Promise<void>((resolve) => {
      clientA.ws.on('message', (data) => {
        const payload = JSON.parse(data.toString());
        if (payload.type === 'ALERT_ACK') {
          resolve();
        }
      });
    });

    // Wait for Client B to receive the relayed alert
    await clientBReceivedAlertPromise;

    // Wait a brief moment to confirm Client C did not receive anything
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(clientCReceivedAlert).toBe(false);

    clientA.ws.close();
    clientB.ws.close();
    clientC.ws.close();
  });

  it('should relay WebRTC signaling directly to target session', async () => {
    const clientA = await connectClient();
    const clientB = await connectClient();

    const signalPromise = new Promise<void>((resolve) => {
      clientA.ws.on('message', (data) => {
        const payload = JSON.parse(data.toString());
        if (payload.type === 'WEBRTC_SIGNAL') {
          expect(payload.originSessionId).toBe(clientB.sessionId);
          expect(payload.signal.kind).toBe('offer');
          expect(payload.signal.payload).toBe('sdp-offer-data');
          resolve();
        }
      });
    });

    clientB.ws.send(
      JSON.stringify({
        type: 'WEBRTC_SIGNAL',
        targetSessionId: clientA.sessionId,
        originSessionId: clientB.sessionId,
        signal: {
          kind: 'offer',
          payload: 'sdp-offer-data',
        },
      }),
    );

    await signalPromise;

    clientA.ws.close();
    clientB.ws.close();
  });

  it('should cleanup connections and subscriptions on close', async () => {
    const client = await connectClient();

    // Subscribe to a cell
    await new Promise<void>((resolve) => {
      client.ws.send(
        JSON.stringify({
          type: 'SUBSCRIBE',
          geohashes: ['9q8yyw'],
          sessionId: client.sessionId,
        }),
      );
      client.ws.once('message', () => resolve());
    });

    expect(activeConnections.has(client.sessionId)).toBe(true);
    expect(geohashSubscriptions.get('9q8yyw')?.has(client.sessionId)).toBe(true);

    // Close socket
    client.ws.close();

    // Wait for cleanup hook to run
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(activeConnections.has(client.sessionId)).toBe(false);
    expect(geohashSubscriptions.has('9q8yyw')).toBe(false);
    expect(sessionSubscriptions.has(client.sessionId)).toBe(false);
  });
});
