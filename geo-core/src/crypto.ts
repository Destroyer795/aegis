/**
 * @module crypto
 * @description Zero-knowledge client-side encryption for the Aegis swarm.
 *
 * Uses the native WebCrypto API (AES-GCM 256-bit) to encrypt alert payloads
 * BEFORE they leave the client device. The edge router only ever sees opaque
 * ciphertext + IV strings — it cannot decrypt or inspect payload content.
 *
 * Key derivation uses PBKDF2 with a pre-shared community passphrase.
 * In production, this passphrase would be an agreed-upon neighborhood secret
 * or derived from the GeoHash cell itself.
 *
 * Works in both browser (window.crypto) and Node.js 15+ (globalThis.crypto).
 */

// ─── Internal Helpers ────────────────────────────────────────────────

/** Resolve the WebCrypto `subtle` API from the runtime environment. */
function getSubtle(): SubtleCrypto {
  // Browser environment
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle;
  }
  throw new Error(
    'WebCrypto API (crypto.subtle) is not available in this environment.',
  );
}

/** Resolve the crypto object for IV generation. */
function getCrypto(): Crypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto;
  }
  throw new Error(
    'WebCrypto API is not available in this environment.',
  );
}

/** Convert a UTF-8 string to a Uint8Array. */
function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** Convert a Uint8Array to a hex string. */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Convert a hex string to a Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ─── PBKDF2 Key Derivation ──────────────────────────────────────────

/**
 * Fixed salt used for PBKDF2 key derivation.
 * In a production system, this would be a per-neighborhood salt distributed
 * via a secure channel. For the Aegis hackathon, a static salt is acceptable
 * because the security boundary is the passphrase itself.
 */
const PBKDF2_SALT = stringToBytes('aegis-swarm-pbkdf2-salt-v1');

/** Number of PBKDF2 iterations — balances security vs. mobile perf. */
const PBKDF2_ITERATIONS = 100_000;

/**
 * Derive an AES-GCM 256-bit CryptoKey from a passphrase via PBKDF2.
 *
 * @param passphrase - Community-shared secret string.
 * @returns An AES-GCM CryptoKey ready for encrypt/decrypt operations.
 */
export async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const subtle = getSubtle();
  const passphraseBytes = stringToBytes(passphrase);
  const keyMaterial = await subtle.importKey(
    'raw',
    passphraseBytes.buffer as ArrayBuffer,
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: PBKDF2_SALT.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ─── Encryption / Decryption ────────────────────────────────────────

/**
 * Result of encrypting a plaintext payload.
 * Both `ciphertext` and `iv` are hex-encoded strings safe for JSON transport.
 */
export interface EncryptedPayload {
  /** AES-GCM ciphertext as a hex string. */
  readonly ciphertext: string;
  /** 96-bit initialization vector as a hex string. */
  readonly iv: string;
}

/**
 * Encrypt a plaintext string using AES-GCM 256-bit.
 *
 * @param plaintext - The string to encrypt.
 * @param secretKey - A community passphrase used to derive the AES key.
 * @returns An object containing the hex-encoded ciphertext and IV.
 *
 * @example
 * ```ts
 * const encrypted = await encryptPayload('Gas leak on 5th Ave', 'neighborhood-secret');
 * // => { ciphertext: 'a3f1...', iv: 'b7c2...' }
 * ```
 */
export async function encryptPayload(
  plaintext: string,
  secretKey: string,
): Promise<EncryptedPayload> {
  const subtle = getSubtle();
  const crypto = getCrypto();
  const key = await deriveKey(secretKey);

  // 96-bit IV recommended for AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = stringToBytes(plaintext);

  const ciphertextBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    plaintextBytes.buffer as ArrayBuffer,
  );

  return {
    ciphertext: bytesToHex(new Uint8Array(ciphertextBuffer)),
    iv: bytesToHex(iv),
  };
}

/**
 * Decrypt an AES-GCM 256-bit ciphertext back to a plaintext string.
 *
 * @param ciphertext - Hex-encoded ciphertext string.
 * @param iv - Hex-encoded initialization vector string.
 * @param secretKey - The same community passphrase used to encrypt.
 * @returns The decrypted plaintext string.
 *
 * @throws If the key is incorrect or the ciphertext has been tampered with,
 *         the WebCrypto API throws an `OperationError`.
 *
 * @example
 * ```ts
 * const message = await decryptPayload(encrypted.ciphertext, encrypted.iv, 'neighborhood-secret');
 * // => 'Gas leak on 5th Ave'
 * ```
 */
export async function decryptPayload(
  ciphertext: string,
  iv: string,
  secretKey: string,
): Promise<string> {
  const subtle = getSubtle();
  const key = await deriveKey(secretKey);

  const ciphertextBytes = hexToBytes(ciphertext);
  const ivBytes = hexToBytes(iv);

  const plaintextBuffer = await subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes.buffer as ArrayBuffer },
    key,
    ciphertextBytes.buffer as ArrayBuffer,
  );

  return new TextDecoder().decode(plaintextBuffer);
}
