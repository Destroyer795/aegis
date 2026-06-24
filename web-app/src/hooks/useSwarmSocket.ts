import { useState, useEffect, useRef, useCallback } from 'react';
import {
  createSubscriptionPayloadFromCoords,
  encodeGeoHash,
  AlertSeverity,
} from '@aegis/geo-core';
import type { AlertBroadcastPayload, AlertRelayPayload } from '@aegis/geo-core';

export type SocketStatus = 'connecting' | 'connected' | 'disconnected';

export interface UseSwarmSocketProps {
  latitude: number | null;
  longitude: number | null;
  onAlertReceived: (alert: AlertBroadcastPayload) => void;
}

/**
 * Custom hook to manage the WebSocket lifecycle and coordinates subscription.
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

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);

        if (payload.type === 'WELCOME') {
          setSessionId(payload.sessionId);
        } else if (payload.type === 'ALERT_RELAY') {
          const relay = payload as AlertRelayPayload;
          onAlertReceived(relay.alert);
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
    (message: string, severity: AlertSeverity = AlertSeverity.CRITICAL) => {
      const ws = socketRef.current;
      if (!ws || status !== 'connected' || !sessionId || latitude === null || longitude === null) {
        throw new Error('Swarm WebSocket is not connected or location is not established.');
      }

      const centerGeohash = encodeGeoHash(latitude, longitude, 6);

      const alertPayload: AlertBroadcastPayload = {
        type: 'ALERT',
        geohash: centerGeohash,
        severity,
        message,
        timestamp: new Date().toISOString(),
        originSessionId: sessionId,
      };

      ws.send(JSON.stringify(alertPayload));
    },
    [latitude, longitude, sessionId, status]
  );

  return {
    status,
    sessionId,
    broadcastAlert,
  };
}
