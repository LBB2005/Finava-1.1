import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env.ts captures process.env into its raw objects at MODULE LOAD, so every test
// stubs env first and then imports a FRESH module instance (vi.resetModules).

const FULL_ENV: Record<string, string> = {
  NODE_ENV: "test",
  FIREBASE_PROJECT_ID: "proj",
  FIREBASE_CLIENT_EMAIL: "svc@proj.iam.gserviceaccount.com",
  FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
  NEXT_PUBLIC_FIREBASE_API_KEY: "api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "proj.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "proj",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "proj.appspot.com",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:123456:web:abc",
};

function applyEnv(overrides: Record<string, string> = {}) {
  for (const [k, v] of Object.entries({ ...FULL_ENV, ...overrides })) {
    vi.stubEnv(k, v);
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("env validation", () => {
  it("parses a fully-configured environment without throwing", async () => {
    applyEnv();
    const { getServerEnv, getClientEnv, validateEnv } = await import("./env");

    expect(() => validateEnv()).not.toThrow();
    expect(getServerEnv().FIREBASE_PROJECT_ID).toBe("proj");
    expect(getClientEnv().NEXT_PUBLIC_FIREBASE_API_KEY).toBe("api-key");
  });

  it("throws a clear, field-named error when a required server var is missing", async () => {
    applyEnv({ FIREBASE_PRIVATE_KEY: "" });
    const { getServerEnv } = await import("./env");

    expect(() => getServerEnv()).toThrow(/FIREBASE_PRIVATE_KEY/);
  });

  it("throws when a required client var is missing", async () => {
    applyEnv({ NEXT_PUBLIC_FIREBASE_APP_ID: "" });
    const { getClientEnv } = await import("./env");

    expect(() => getClientEnv()).toThrow(/NEXT_PUBLIC_FIREBASE_APP_ID/);
  });

  it("validateEnv surfaces a missing required var (fail-fast at boot)", async () => {
    applyEnv({ FIREBASE_PROJECT_ID: "" });
    const { validateEnv } = await import("./env");

    expect(() => validateEnv()).toThrow(/FIREBASE_PROJECT_ID/);
  });

  it("treats optional keys as absent without throwing", async () => {
    applyEnv();
    const { getServerEnv } = await import("./env");

    const env = getServerEnv();
    // PLAID_TOKEN_KEY is newly introduced and guaranteed unset in the test shell,
    // so it exercises the "optional + absent" path deterministically.
    expect(env.PLAID_TOKEN_KEY).toBeUndefined();
    expect(env.NODE_ENV).toBe("test");
  });

  it("caches the parsed env after the first call", async () => {
    applyEnv();
    const { getServerEnv } = await import("./env");

    expect(getServerEnv()).toBe(getServerEnv());
  });
});
