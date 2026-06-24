/**
 * @module geohash
 * @description Client-side GeoHash computation utilities for the Aegis swarm.
 *
 * GeoHash encoding runs EXCLUSIVELY on the client device. The edge server
 * never receives raw GPS coordinates — only opaque GeoHash strings.
 *
 * Precision table (for reference):
 *   Chars | Cell width  | Cell height
 *   1     | ≤5000 km    | ×5000 km
 *   2     | ≤1250 km    | ×625 km
 *   3     | ≤156 km     | ×156 km
 *   4     | ≤39.1 km    | ×19.5 km
 *   5     | ≤4.89 km    | ×4.89 km
 *   6     | ≤1.22 km    | ×0.61 km   ← Aegis default (~500m coverage)
 *   7     | ≤153 m      | ×153 m
 *   8     | ≤38.2 m     | ×19.1 m
 */

import type { GeoHashString, GeoHashSubscribePayload, SessionId } from './types';

// ─── Constants ──────────────────────────────────────────────────────

/** Base32 alphabet used by the standard GeoHash encoding. */
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Default precision for Aegis alerts.
 * 6 characters ≈ 1.22 km × 0.61 km cells, which envelopes a ~500m radius.
 */
export const AEGIS_GEOHASH_PRECISION = 6;

// ─── Core Encoding ──────────────────────────────────────────────────

/**
 * Encode a (latitude, longitude) pair into a GeoHash string.
 *
 * @param lat  - Latitude in decimal degrees  (−90 … +90)
 * @param lng  - Longitude in decimal degrees (−180 … +180)
 * @param precision - Number of GeoHash characters (default: 6 for ~500m)
 * @returns A GeoHash string of the requested precision.
 *
 * @example
 * ```ts
 * const hash = encodeGeoHash(37.7749, -122.4194); // San Francisco
 * // => "9q8yyk" (6-char precision)
 * ```
 */
export function encodeGeoHash(
  lat: number,
  lng: number,
  precision: number = AEGIS_GEOHASH_PRECISION,
): GeoHashString {
  if (lat < -90 || lat > 90) {
    throw new RangeError(`Latitude must be between -90 and 90, got ${lat}`);
  }
  if (lng < -180 || lng > 180) {
    throw new RangeError(`Longitude must be between -180 and 180, got ${lng}`);
  }
  if (precision < 1 || precision > 12) {
    throw new RangeError(`Precision must be between 1 and 12, got ${precision}`);
  }

  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;

  let hash = '';
  let bit = 0;
  let charIndex = 0;
  let isLng = true; // GeoHash interleaves longitude and latitude bits, starting with longitude

  while (hash.length < precision) {
    if (isLng) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        charIndex = (charIndex << 1) | 1;
        lngMin = mid;
      } else {
        charIndex = charIndex << 1;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        charIndex = (charIndex << 1) | 1;
        latMin = mid;
      } else {
        charIndex = charIndex << 1;
        latMax = mid;
      }
    }

    isLng = !isLng;
    bit++;

    if (bit === 5) {
      hash += BASE32[charIndex];
      bit = 0;
      charIndex = 0;
    }
  }

  return hash;
}

// ─── GeoHash Decoding ────────────────────────────────────────────────

/**
 * Bounding box for a GeoHash cell.
 */
export interface GeoHashBounds {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
}

/**
 * Decode a GeoHash string back into its geographic bounding box.
 *
 * @param geohash - The GeoHash string to decode.
 * @returns The bounding box of the GeoHash cell.
 */
export function decodeGeoHash(geohash: GeoHashString): GeoHashBounds {
  if (!geohash) {
    throw new Error('GeoHash string cannot be empty');
  }

  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let isLng = true;

  for (let i = 0; i < geohash.length; i++) {
    const char = geohash[i];
    const idx = BASE32.indexOf(char);
    if (idx === -1) {
      throw new Error(`Invalid character '${char}' at index ${i} in GeoHash: ${geohash}`);
    }

    for (let bit = 4; bit >= 0; bit--) {
      const bitValue = (idx >> bit) & 1;
      if (isLng) {
        const mid = (lngMin + lngMax) / 2;
        if (bitValue === 1) {
          lngMin = mid;
        } else {
          lngMax = mid;
        }
      } else {
        const mid = (latMin + latMax) / 2;
        if (bitValue === 1) {
          latMin = mid;
        } else {
          latMax = mid;
        }
      }
      isLng = !isLng;
    }
  }

  return { minLat: latMin, maxLat: latMax, minLng: lngMin, maxLng: lngMax };
}

// ─── Neighbor Computation ───────────────────────────────────────────

/**
 * Compute the 8 neighboring GeoHash cells surrounding a center cell.
 * This is essential for the Aegis 500m-radius alert fan-out — an alert in
 * one cell must also reach subscribers in all adjacent cells.
 *
 * Handles longitude wrapping (Date Line) and skips invalid latitudes at the poles.
 *
 * @param geohash - The center GeoHash string.
 * @returns An array of up to 8 neighboring GeoHash strings.
 */
export function getNeighborGeoHashes(geohash: GeoHashString): GeoHashString[] {
  const { minLat, maxLat, minLng, maxLng } = decodeGeoHash(geohash);
  const latHeight = maxLat - minLat;
  const lngWidth = maxLng - minLng;
  const latCenter = (minLat + maxLat) / 2;
  const lngCenter = (minLng + maxLng) / 2;

  const precision = geohash.length;

  const directions = [
    { dy: 1, dx: 0 },   // North
    { dy: 1, dx: 1 },   // North-East
    { dy: 0, dx: 1 },   // East
    { dy: -1, dx: 1 },  // South-East
    { dy: -1, dx: 0 },  // South
    { dy: -1, dx: -1 }, // South-West
    { dy: 0, dx: -1 },  // West
    { dy: 1, dx: -1 },  // North-West
  ];

  const neighbors: string[] = [];

  for (const { dy, dx } of directions) {
    let lat = latCenter + dy * latHeight;
    let lng = lngCenter + dx * lngWidth;

    // Check latitude bounds (no wrapping at poles)
    if (lat > 90 || lat < -90) {
      continue;
    }

    // Longitude wrapping (Date Line wrapping)
    if (lng > 180) {
      lng -= 360;
    } else if (lng < -180) {
      lng += 360;
    }

    neighbors.push(encodeGeoHash(lat, lng, precision));
  }

  return neighbors;
}

// ─── Subscription Cell Set ──────────────────────────────────────────

/**
 * Compute the full set of GeoHash cells a client should subscribe to
 * in order to receive all alerts within ~500m.
 *
 * @param lat - Client latitude
 * @param lng - Client longitude
 * @param precision - Precision level of the GeoHash cells (default: 6)
 * @returns Array containing the client's own cell + all valid neighbors (up to 9 cells).
 */
export function computeSubscriptionCells(
  lat: number,
  lng: number,
  precision: number = AEGIS_GEOHASH_PRECISION,
): GeoHashString[] {
  const centerHash = encodeGeoHash(lat, lng, precision);
  const neighbors = getNeighborGeoHashes(centerHash);
  return [centerHash, ...neighbors];
}

// ─── Payload Constructors ───────────────────────────────────────────

/**
 * Create a structured JSON payload for WebSocket GeoHash subscription.
 *
 * @param geohashes - List of GeoHash strings to subscribe to.
 * @param sessionId - Ephemeral session identifier.
 * @returns Structured GeoHashSubscribePayload object.
 */
export function createSubscriptionPayload(
  geohashes: readonly GeoHashString[],
  sessionId: SessionId,
): GeoHashSubscribePayload {
  return {
    type: 'SUBSCRIBE',
    geohashes,
    sessionId,
  };
}

/**
 * Helper to compute subscription cells and build the WebSocket payload directly from coordinates.
 *
 * @param lat - Client latitude
 * @param lng - Client longitude
 * @param sessionId - Ephemeral session identifier
 * @param precision - Precision level of the GeoHash cells (default: 6)
 * @returns Structured GeoHashSubscribePayload object.
 */
export function createSubscriptionPayloadFromCoords(
  lat: number,
  lng: number,
  sessionId: SessionId,
  precision: number = AEGIS_GEOHASH_PRECISION,
): GeoHashSubscribePayload {
  const geohashes = computeSubscriptionCells(lat, lng, precision);
  return createSubscriptionPayload(geohashes, sessionId);
}
