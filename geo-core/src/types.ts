/**
 * @module types
 * @description Interface definitions for the Aegis GeoHash Pub/Sub system.
 *
 * These types are shared across the entire Aegis stack:
 *   - edge-router: Uses them for WebSocket message routing
 *   - web-app:     Uses them for client-side alert composition
 *   - tui-observer: Deserializes them for grid visualization
 */

// ─── GeoHash Identifiers ────────────────────────────────────────────

/** A GeoHash string at the precision level covering ~500m × 500m cells (6 characters). */
export type GeoHashString = string;

/** A unique, ephemeral session identifier for an anonymous WebSocket connection. */
export type SessionId = string;

// ─── Alert Severity ─────────────────────────────────────────────────

export enum AlertSeverity {
  /** Informational — noise complaint, stray animal, etc. */
  INFO = 'INFO',
  /** Warning — suspicious activity, minor hazard */
  WARNING = 'WARNING',
  /** Critical — active emergency requiring immediate attention */
  CRITICAL = 'CRITICAL',
}

// ─── Pub/Sub Payloads ───────────────────────────────────────────────

/**
 * Sent by a client to subscribe to GeoHash cells.
 * The server never sees raw lat/lng — only the pre-computed GeoHash strings.
 */
export interface GeoHashSubscribePayload {
  readonly type: 'SUBSCRIBE';
  /** GeoHash cells the client wants to monitor (self + neighbors). */
  readonly geohashes: readonly GeoHashString[];
  /** Ephemeral session identifier — not tied to any user identity. */
  readonly sessionId: SessionId;
}

/**
 * Sent by a client to unsubscribe from GeoHash cells.
 */
export interface GeoHashUnsubscribePayload {
  readonly type: 'UNSUBSCRIBE';
  readonly geohashes: readonly GeoHashString[];
  readonly sessionId: SessionId;
}

/**
 * An alert broadcast into a GeoHash cell.
 * Contains NO personally identifiable information.
 */
export interface AlertBroadcastPayload {
  readonly type: 'ALERT';
  /** The GeoHash cell this alert originates from. */
  readonly geohash: GeoHashString;
  /** Alert severity level. */
  readonly severity: AlertSeverity;
  /** Free-text description of the micro-emergency (max 280 chars). */
  readonly message: string;
  /** ISO 8601 timestamp of alert creation. */
  readonly timestamp: string;
  /** Ephemeral session ID of the alerting peer (for WebRTC handoff). */
  readonly originSessionId: SessionId;
}

/**
 * Server-side relay of an alert to all subscribers of a GeoHash cell.
 */
export interface AlertRelayPayload {
  readonly type: 'ALERT_RELAY';
  /** The original alert payload. */
  readonly alert: AlertBroadcastPayload;
  /** All GeoHash cells this alert was relayed to. */
  readonly relayedTo: readonly GeoHashString[];
}

// ─── WebRTC Signaling ───────────────────────────────────────────────

/**
 * WebRTC signaling payloads routed through the edge for initial handshake,
 * then the connection becomes fully peer-to-peer.
 */
export interface WebRTCSignalPayload {
  readonly type: 'WEBRTC_SIGNAL';
  /** Target peer session ID. */
  readonly targetSessionId: SessionId;
  /** Originator session ID. */
  readonly originSessionId: SessionId;
  /** SDP offer/answer or ICE candidate. */
  readonly signal: RTCSignalData;
}

export interface RTCSignalData {
  readonly kind: 'offer' | 'answer' | 'ice-candidate';
  /** Serialized SDP or ICE candidate JSON. */
  readonly payload: string;
}

// ─── Encrypted Alert Payloads ───────────────────────────────────────

/**
 * An encrypted alert broadcast sent over the wire.
 * The `message` field is replaced with `ciphertext` + `iv` —
 * the edge router sees only opaque hex strings, never plaintext.
 */
export interface EncryptedAlertBroadcastPayload {
  readonly type: 'ALERT';
  /** The GeoHash cell this alert originates from. */
  readonly geohash: GeoHashString;
  /** Alert severity level. */
  readonly severity: AlertSeverity;
  /** AES-GCM encrypted message (hex-encoded). */
  readonly ciphertext: string;
  /** AES-GCM initialization vector (hex-encoded). */
  readonly iv: string;
  /** ISO 8601 timestamp of alert creation. */
  readonly timestamp: string;
  /** Ephemeral session ID of the alerting peer (for WebRTC handoff). */
  readonly originSessionId: SessionId;
}

/**
 * Server-side relay of an encrypted alert.
 */
export interface EncryptedAlertRelayPayload {
  readonly type: 'ALERT_RELAY';
  /** The encrypted alert payload. */
  readonly alert: EncryptedAlertBroadcastPayload;
  /** All GeoHash cells this alert was relayed to. */
  readonly relayedTo: readonly GeoHashString[];
}

// ─── Resolve Incident Payloads ──────────────────────────────────────

/**
 * Sent by the original alerter to signal that the incident has been resolved.
 * Contains an encrypted confirmation message. The edge router treats this
 * identically to an ALERT — it fans out to all GeoHash cell subscribers.
 */
export interface ResolvePayload {
  readonly type: 'RESOLVE';
  /** The GeoHash cell this resolve applies to. */
  readonly geohash: GeoHashString;
  /** AES-GCM encrypted confirmation message (hex-encoded). */
  readonly ciphertext: string;
  /** AES-GCM initialization vector (hex-encoded). */
  readonly iv: string;
  /** ISO 8601 timestamp of resolution. */
  readonly timestamp: string;
  /** Session ID of the peer resolving the incident (must match original alerter). */
  readonly originSessionId: SessionId;
}

/**
 * Server-side relay of a RESOLVE message to all GeoHash cell subscribers.
 */
export interface ResolveRelayPayload {
  readonly type: 'RESOLVE_RELAY';
  /** The original resolve payload. */
  readonly resolve: ResolvePayload;
  /** All GeoHash cells this resolve was relayed to. */
  readonly relayedTo: readonly GeoHashString[];
}

// ─── Aggregate Message Union ────────────────────────────────────────

/** All possible messages flowing through the Aegis edge router. */
export type AegisMessage =
  | GeoHashSubscribePayload
  | GeoHashUnsubscribePayload
  | AlertBroadcastPayload
  | AlertRelayPayload
  | EncryptedAlertBroadcastPayload
  | EncryptedAlertRelayPayload
  | ResolvePayload
  | ResolveRelayPayload
  | WebRTCSignalPayload;

// ─── Observability (TUI) ───────────────────────────────────────────

/** Aggregate stats for a single GeoHash cell — used by the TUI observer. */
export interface GeoHashCellStats {
  readonly geohash: GeoHashString;
  /** Number of anonymous sessions currently subscribed. */
  readonly subscriberCount: number;
  /** Number of alerts in the last 60 seconds. */
  readonly recentAlertCount: number;
  /** Highest severity seen in the last 60 seconds. */
  readonly peakSeverity: AlertSeverity | null;
}
