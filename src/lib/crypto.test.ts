import { beforeEach, describe, expect, it, vi } from "vitest";

// Control PLAID_TOKEN_KEY via a mocked env so the test is hermetic (no Firebase).
const deps = vi.hoisted(() => ({ plaidTokenKey: undefined as string | undefined }));
vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({ PLAID_TOKEN_KEY: deps.plaidTokenKey }),
}));

import { decryptSecret, encryptSecret, isEncrypted } from "./crypto";

const KEY_B64 = Buffer.alloc(32, 7).toString("base64"); // deterministic 32-byte key

beforeEach(() => {
  deps.plaidTokenKey = KEY_B64;
});

describe("crypto — AES-256-GCM secret envelope", () => {
  it("round-trips a secret and never exposes the plaintext in the envelope", () => {
    const token = "access-sandbox-6f1c2b3a";
    const enc = encryptSecret(token);

    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(enc).not.toContain(token);
    expect(isEncrypted(enc)).toBe(true);
    expect(decryptSecret(enc)).toBe(token);
  });

  it("uses a fresh IV per call so identical inputs yield different ciphertexts", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("passes a legacy plaintext value through unchanged (dual-read migration)", () => {
    const legacy = "access-sandbox-legacy-plaintext";
    expect(isEncrypted(legacy)).toBe(false);
    expect(decryptSecret(legacy)).toBe(legacy);
  });

  it("rejects a tampered ciphertext (auth-tag mismatch)", () => {
    const enc = encryptSecret("secret");
    const [scheme, ver, iv, , ct] = enc.split(":");
    const forgedTag = Buffer.alloc(16, 0).toString("base64");
    const tampered = [scheme, ver, iv, forgedTag, ct].join(":");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("accepts a hex-encoded key", () => {
    deps.plaidTokenKey = Buffer.alloc(32, 9).toString("hex");
    const enc = encryptSecret("hex-key-token");
    expect(decryptSecret(enc)).toBe("hex-key-token");
  });

  it("throws a clear error when the key is missing", () => {
    deps.plaidTokenKey = undefined;
    expect(() => encryptSecret("x")).toThrow(/PLAID_TOKEN_KEY/);
  });

  it("rejects a key that is not 32 bytes", () => {
    deps.plaidTokenKey = Buffer.alloc(16, 1).toString("base64");
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
  });
});
