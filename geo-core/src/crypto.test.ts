/**
 * @module crypto.test
 * @description Unit tests for the Aegis AES-GCM 256-bit encryption module.
 *
 * Tests verify:
 *   - Round-trip encrypt → decrypt produces the original plaintext
 *   - Different IVs produce different ciphertexts (non-deterministic)
 *   - Wrong passphrase fails to decrypt
 *   - Empty string encryption works
 *   - Unicode / emoji support
 *   - Large payload handling
 */

import { describe, it, expect } from 'vitest';
import { encryptPayload, decryptPayload, deriveKey } from './crypto';

describe('Aegis Crypto — AES-GCM 256-bit', () => {
  const SECRET = 'neighborhood-alpha-key';
  const WRONG_SECRET = 'wrong-key-entirely';

  describe('encryptPayload', () => {
    it('should return a ciphertext and iv as hex strings', async () => {
      const result = await encryptPayload('test message', SECRET);

      expect(result).toHaveProperty('ciphertext');
      expect(result).toHaveProperty('iv');
      expect(typeof result.ciphertext).toBe('string');
      expect(typeof result.iv).toBe('string');

      // Both should be hex strings
      expect(result.ciphertext).toMatch(/^[0-9a-f]+$/);
      expect(result.iv).toMatch(/^[0-9a-f]+$/);
    });

    it('should produce a 24-char hex IV (96-bit)', async () => {
      const result = await encryptPayload('hello world', SECRET);
      // 12 bytes = 24 hex characters
      expect(result.iv).toHaveLength(24);
    });

    it('should produce different ciphertexts for the same plaintext (unique IV per call)', async () => {
      const a = await encryptPayload('same message', SECRET);
      const b = await encryptPayload('same message', SECRET);

      // IVs should differ (random)
      expect(a.iv).not.toBe(b.iv);
      // Ciphertexts should also differ due to different IVs
      expect(a.ciphertext).not.toBe(b.ciphertext);
    });

    it('should handle empty string input', async () => {
      const result = await encryptPayload('', SECRET);
      expect(result.ciphertext.length).toBeGreaterThan(0); // AES-GCM auth tag still present
      expect(result.iv).toHaveLength(24);
    });
  });

  describe('decryptPayload', () => {
    it('should round-trip: encrypt → decrypt returns the original plaintext', async () => {
      const plaintext = 'Gas leak on 5th Avenue — evacuate block now!';
      const encrypted = await encryptPayload(plaintext, SECRET);
      const decrypted = await decryptPayload(encrypted.ciphertext, encrypted.iv, SECRET);

      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt Unicode and emoji content correctly', async () => {
      const plaintext = '🚨 火災発生！ Evacuate immediately 🏃‍♂️';
      const encrypted = await encryptPayload(plaintext, SECRET);
      const decrypted = await decryptPayload(encrypted.ciphertext, encrypted.iv, SECRET);

      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt empty string correctly', async () => {
      const encrypted = await encryptPayload('', SECRET);
      const decrypted = await decryptPayload(encrypted.ciphertext, encrypted.iv, SECRET);

      expect(decrypted).toBe('');
    });

    it('should decrypt a large payload (280-char max alert)', async () => {
      const plaintext = 'A'.repeat(280);
      const encrypted = await encryptPayload(plaintext, SECRET);
      const decrypted = await decryptPayload(encrypted.ciphertext, encrypted.iv, SECRET);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw OperationError when decrypting with wrong passphrase', async () => {
      const encrypted = await encryptPayload('secret message', SECRET);

      await expect(
        decryptPayload(encrypted.ciphertext, encrypted.iv, WRONG_SECRET),
      ).rejects.toThrow();
    });

    it('should throw when ciphertext is tampered with', async () => {
      const encrypted = await encryptPayload('important alert', SECRET);

      // Flip the first byte of the ciphertext
      const tampered = (encrypted.ciphertext[0] === '0' ? '1' : '0') + encrypted.ciphertext.slice(1);

      await expect(
        decryptPayload(tampered, encrypted.iv, SECRET),
      ).rejects.toThrow();
    });

    it('should throw when IV is tampered with', async () => {
      const encrypted = await encryptPayload('important alert', SECRET);

      // Flip the first byte of the IV
      const tampered = (encrypted.iv[0] === '0' ? '1' : '0') + encrypted.iv.slice(1);

      await expect(
        decryptPayload(encrypted.ciphertext, tampered, SECRET),
      ).rejects.toThrow();
    });
  });

  describe('deriveKey', () => {
    it('should derive a CryptoKey from a passphrase', async () => {
      const key = await deriveKey(SECRET);
      expect(key).toBeDefined();
      // CryptoKey has .type and .algorithm
      expect(key.type).toBe('secret');
      expect((key.algorithm as AesKeyAlgorithm).name).toBe('AES-GCM');
      expect((key.algorithm as AesKeyAlgorithm).length).toBe(256);
    });

    it('should produce consistent keys from the same passphrase (deterministic derivation)', async () => {
      // Derive two keys with the same passphrase, encrypt with one, decrypt with the other
      const plaintext = 'deterministic key derivation test';
      const encrypted = await encryptPayload(plaintext, SECRET);
      const decrypted = await decryptPayload(encrypted.ciphertext, encrypted.iv, SECRET);

      expect(decrypted).toBe(plaintext);
    });
  });
});
