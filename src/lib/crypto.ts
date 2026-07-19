import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { getServerEnv } from "@/lib/env";

/**
 * Symmetric encryption for secrets held at rest in Firestore — principally the
 * Plaid access tokens that grant ongoing read access to a user's real brokerage
 * positions. AES-256-GCM (authenticated) with a 32-byte key from PLAID_TOKEN_KEY.
 *
 * Envelope format (single string, colon-delimited, base64 parts):
 *   enc:v1:<iv>:<authTag>:<ciphertext>
 * The `enc:v1` scheme prefix lets us tell an encrypted value from a legacy
 * plaintext one, which powers a non-destructive migration: values written before
 * encryption are read back verbatim (see decryptSecret) and re-encrypted the next
 * time they're written. `v1` also leaves room for future key rotation.
 */
const SCHEME = "enc:v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the standard/recommended size for GCM

function loadKey(): Buffer {
  const raw = getServerEnv().PLAID_TOKEN_KEY;
  if (!raw) {
    throw new Error(
      "PLAID_TOKEN_KEY is not set — cannot encrypt/decrypt secrets at rest. " +
        "Generate one with `openssl rand -base64 32` and set it in the environment."
    );
  }
  // Accept a 64-char hex key or a base64 key; both must decode to 32 bytes.
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `PLAID_TOKEN_KEY must decode to 32 bytes (got ${key.length}). Use \`openssl rand -base64 32\`.`
    );
  }
  return key;
}

/** True when a stored value is in our encrypted envelope (vs legacy plaintext). */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${SCHEME}:`);
}

/** Encrypt a secret string into a self-describing `enc:v1:iv:tag:ct` envelope. */
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SCHEME}:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/**
 * Decrypt a value produced by encryptSecret. Dual-read migration: a value that is
 * NOT in the encrypted envelope is treated as legacy plaintext and returned
 * unchanged, so tokens written before encryption keep working until their next
 * write re-encrypts them. Throws on a malformed envelope or a failed auth tag
 * (tampering / wrong key).
 */
export function decryptSecret(value: string): string {
  if (!isEncrypted(value)) return value; // legacy plaintext — pass through

  const parts = value.split(":");
  // ["enc", "v1", iv, tag, ct] — base64 parts never contain ":".
  if (parts.length !== 5) {
    throw new Error("Malformed encrypted secret envelope");
  }
  const [, , ivB64, tagB64, ctB64] = parts;
  const key = loadKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return pt.toString("utf8");
}
