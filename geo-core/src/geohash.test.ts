import { describe, it, expect } from 'vitest';
import {
  encodeGeoHash,
  decodeGeoHash,
  getNeighborGeoHashes,
  computeSubscriptionCells,
  createSubscriptionPayload,
  createSubscriptionPayloadFromCoords,
} from './geohash';

describe('GeoHash Core Logic & Grid Neighbor math', () => {
  // ─── 1. Encoding Tests ──────────────────────────────────────────────

  describe('encodeGeoHash', () => {
    it('should encode coordinates in San Francisco (default precision = 6)', () => {
      const hash = encodeGeoHash(37.7749, -122.4194);
      expect(hash).toBe('9q8yyk');
      expect(hash.length).toBe(6);
    });

    it('should encode coordinates in London (precision = 8)', () => {
      const hash = encodeGeoHash(51.5074, -0.1278, 8);
      expect(hash).toBe('gcpvj0du');
      expect(hash.length).toBe(8);
    });

    it('should throw RangeError for invalid coordinates', () => {
      expect(() => encodeGeoHash(-91, 0)).toThrow(RangeError);
      expect(() => encodeGeoHash(91, 0)).toThrow(RangeError);
      expect(() => encodeGeoHash(0, -181)).toThrow(RangeError);
      expect(() => encodeGeoHash(0, 181)).toThrow(RangeError);
    });

    it('should throw RangeError for invalid precision', () => {
      expect(() => encodeGeoHash(0, 0, 0)).toThrow(RangeError);
      expect(() => encodeGeoHash(0, 0, 13)).toThrow(RangeError);
    });
  });

  // ─── 2. Decoding Tests ──────────────────────────────────────────────

  describe('decodeGeoHash', () => {
    it('should decode a geohash and yield bounds enclosing the center', () => {
      const hash = '9q8yyk';
      const bounds = decodeGeoHash(hash);

      expect(bounds.minLat).toBeLessThan(37.7749);
      expect(bounds.maxLat).toBeGreaterThan(37.7749);
      expect(bounds.minLng).toBeLessThan(-122.4194);
      expect(bounds.maxLng).toBeGreaterThan(-122.4194);
    });

    it('should throw error for empty or invalid geohash strings', () => {
      expect(() => decodeGeoHash('')).toThrow('GeoHash string cannot be empty');
      expect(() => decodeGeoHash('a')).toThrow("Invalid character 'a'");
    });
  });

  // ─── 3. Neighbor Tests ──────────────────────────────────────────────

  describe('getNeighborGeoHashes', () => {
    it('should return exactly 8 neighbors for a non-polar geohash', () => {
      const neighbors = getNeighborGeoHashes('9q8yyk');
      expect(neighbors).toHaveLength(8);
      // Ensure all neighbors are unique
      const uniqueNeighbors = new Set(neighbors);
      expect(uniqueNeighbors.size).toBe(8);
      // Ensure neighbors are of the same length
      neighbors.forEach((n) => expect(n.length).toBe(6));
    });

    it('should handle equator crossing (lat = 0)', () => {
      // "s00000" is near the equator
      const hash = encodeGeoHash(0.001, 10.0, 6);
      const neighbors = getNeighborGeoHashes(hash);
      expect(neighbors).toHaveLength(8);

      // Verify that neighbors span both northern and southern hemispheres
      const decodedNeighbors = neighbors.map(decodeGeoHash);
      const northernCount = decodedNeighbors.filter((b) => b.minLat >= 0).length;
      const southernCount = decodedNeighbors.filter((b) => b.maxLat <= 0).length;
      expect(northernCount + southernCount).toBe(8);
      expect(northernCount).toBeGreaterThan(0);
      expect(southernCount).toBeGreaterThan(0);
    });

    it('should handle prime meridian crossing (lng = 0)', () => {
      // Greenwich, London is on the prime meridian
      const hash = encodeGeoHash(51.4769, 0.0, 6);
      const neighbors = getNeighborGeoHashes(hash);
      expect(neighbors).toHaveLength(8);

      const decodedNeighbors = neighbors.map(decodeGeoHash);
      const easternCount = decodedNeighbors.filter((b) => b.minLng >= 0).length;
      const westernCount = decodedNeighbors.filter((b) => b.maxLng <= 0).length;
      expect(easternCount + westernCount).toBe(8);
      expect(easternCount).toBeGreaterThan(0);
      expect(westernCount).toBeGreaterThan(0);
    });

    it('should wrap longitude across the 180th meridian (Date Line)', () => {
      // Fiji / Taveuni area crosses the 180th meridian.
      // lat = -16.0, lng = 179.999 (Eastern hemisphere)
      const centerHash = encodeGeoHash(-16.0, 179.999, 6);
      const neighbors = getNeighborGeoHashes(centerHash);

      expect(neighbors).toHaveLength(8);

      // Verify some neighbors wrapped to the Western hemisphere (negative longitudes)
      const decodedNeighbors = neighbors.map(decodeGeoHash);
      const wrappedNeighbors = decodedNeighbors.filter(
        (b) => b.minLng < -179 && b.maxLng > -180,
      );
      expect(wrappedNeighbors.length).toBeGreaterThan(0);
    });

    it('should skip invalid latitude cells near the poles (less than 8 neighbors)', () => {
      // North Pole (lat = 89.999)
      const northPoleHash = encodeGeoHash(89.999, 0.0, 6);
      const neighbors = getNeighborGeoHashes(northPoleHash);

      // Since lat > 90 is invalid and skipped, we should have less than 8 neighbors
      expect(neighbors.length).toBeLessThan(8);
      expect(neighbors.length).toBeGreaterThan(0);

      // Ensure no neighbor exceeds latitude 90
      const decodedNeighbors = neighbors.map(decodeGeoHash);
      decodedNeighbors.forEach((b) => {
        expect(b.maxLat).toBeLessThanOrEqual(90);
        expect(b.minLat).toBeLessThan(90);
      });
    });
  });

  // ─── 4. Subscription Cell Set Tests ─────────────────────────────────

  describe('computeSubscriptionCells', () => {
    it('should return 9 total cells including the center cell', () => {
      const cells = computeSubscriptionCells(37.7749, -122.4194, 6);
      expect(cells).toHaveLength(9);
      expect(cells[0]).toBe('9q8yyk'); // Center should be first
      const uniqueCells = new Set(cells);
      expect(uniqueCells.size).toBe(9);
    });
  });

  // ─── 5. Payload Constructor Tests ───────────────────────────────────

  describe('payload constructors', () => {
    it('should build a valid SUBSCRIBE payload using createSubscriptionPayload', () => {
      const geohashes = ['9q8yyk', '9q8yye'];
      const sessionId = 'test-session-123';
      const payload = createSubscriptionPayload(geohashes, sessionId);

      expect(payload).toEqual({
        type: 'SUBSCRIBE',
        geohashes,
        sessionId,
      });
    });

    it('should build a valid SUBSCRIBE payload directly from coordinates using createSubscriptionPayloadFromCoords', () => {
      const sessionId = 'test-session-456';
      const payload = createSubscriptionPayloadFromCoords(37.7749, -122.4194, sessionId, 6);

      expect(payload.type).toBe('SUBSCRIBE');
      expect(payload.sessionId).toBe(sessionId);
      expect(payload.geohashes).toHaveLength(9);
      expect(payload.geohashes[0]).toBe('9q8yyk');
    });
  });
});
