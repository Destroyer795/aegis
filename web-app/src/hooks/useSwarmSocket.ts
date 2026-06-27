import { useState, useEffect, useRef, useCallback } from 'react';
import {
  createSubscriptionPayloadFromCoords,
  encodeGeoHash,
  encryptPayload,
  decryptPayload,
  AlertSeverity,
} from '@aegis/geo-core';
import type {
  AlertBroadcastPayload,
  EncryptedAlertRelayPayload,
} from '@aegis/geo-core';

export type SocketStatus = 'connecting' | 'connected' | 'disconnected';

/**
 * Default community passphrase for encryption.
 * In production, this would be a per-neighborhood secret distributed
 * via a secure onboarding channel. For the hackathon demo, we use
 * a hardcoded passphrase to demonstrate the zero-knowledge architecture.
 */
const COMMUNITY_SECRET = 'aegis-demo-neighborhood-key-2024';

export interface UseSwarmSocketProps {
  latitude: number | null;
  longitude: number | null;
  onAlertReceived: (alert: AlertBroadcastPayload) => void;
}

/**
 * Custom hook to manage the WebSocket lifecycle, coordinates subscription,
 * and AES-GCM 256-bit end-to-end encryption of alert payloads.
 *
 * - Outgoing ALERTs: plaintext message → encryptPayload() → ciphertext+iv sent to server
 * - Incoming ALERT_RELAYs: ciphertext+iv received → decryptPayload() → plaintext alert
 *
 * The edge-router NEVER sees plaintext alert messages.
 */
export function useSwarmSocket({ latitude, longitude, onAlertReceived }: UseSwarmSocketProps) {
  const [status, setStatus] = useState<SocketStatus>('disconnected');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    setStatus('connecting');
    const ws = new WebSocket('ws://localhost:8080');
    socketRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
    };

    ws.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);

        if (payload.type === 'WELCOME') {
          setSessionId(payload.sessionId);
        } else if (payload.type === 'ALERT_RELAY') {
          const relay = payload as EncryptedAlertRelayPayload;
          const encAlert = relay.alert;

          // Decrypt the ciphertext back to the original plaintext message
          if (encAlert.ciphertext && encAlert.iv) {
            try {
              const decryptedMessage = await decryptPayload(
                encAlert.ciphertext,
                encAlert.iv,
                COMMUNITY_SECRET,
              );

              // Reconstruct a clean AlertBroadcastPayload with the decrypted message
              const decryptedAlert: AlertBroadcastPayload = {
                type: 'ALERT',
                geohash: encAlert.geohash,
                severity: encAlert.severity,
                message: decryptedMessage,
                timestamp: encAlert.timestamp,
                originSessionId: encAlert.originSessionId,
              };

              onAlertReceived(decryptedAlert);
            } catch (decryptErr) {
              console.warn(
                '🔒 Failed to decrypt alert — likely from a different neighborhood key:',
                decryptErr,
              );
            }
          } else {
            // Fallback: unencrypted relay (backwards compatibility)
            const legacyRelay = payload as { alert: AlertBroadcastPayload };
            onAlertReceived(legacyRelay.alert);
          }
        }
      } catch (err) {
        console.error('Error handling WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      setSessionId(null);
    };

    ws.onerror = () => {
      setStatus('disconnected');
    };

    return () => {
      ws.close();
      socketRef.current = null;
    };
  }, [onAlertReceived]);

  // Synchronize GeoHash subscriptions when location or sessionId updates
  useEffect(() => {
    const ws = socketRef.current;
    if (ws && status === 'connected' && sessionId && latitude !== null && longitude !== null) {
      const subscribePayload = createSubscriptionPayloadFromCoords(
        latitude,
        longitude,
        sessionId,
        6 // default precision covering ~500m radius
      );
      ws.send(JSON.stringify(subscribePayload));
    }
  }, [latitude, longitude, sessionId, status]);

  const broadcastAlert = useCallback(
    async (message: string, severity: AlertSeverity = AlertSeverity.CRITICAL) => {
      const ws = socketRef.current;
      if (!ws || status !== 'connected' || !sessionId || latitude === null || longitude === null) {
        throw new Error('Swarm WebSocket is not connected or location is not established.');
      }

      const centerGeohash = encodeGeoHash(latitude, longitude, 6);

      // Encrypt the plaintext message before transmission
      const { ciphertext, iv } = await encryptPayload(message, COMMUNITY_SECRET);

      // Construct the encrypted alert payload — no plaintext leaves the device
      const encryptedAlertPayload = {
        type: 'ALERT' as const,
        geohash: centerGeohash,
        severity,
        ciphertext,
        iv,
        timestamp: new Date().toISOString(),
        originSessionId: sessionId,
      };

      ws.send(JSON.stringify(encryptedAlertPayload));
    },
    [latitude, longitude, sessionId, status],
  );

  return {
    status,
    sessionId,
    broadcastAlert,
  };
}
