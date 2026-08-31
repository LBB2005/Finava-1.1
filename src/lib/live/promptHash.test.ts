import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promptHash, deployedCommit, provenance } from "./promptHash";

const saved = { ...process.env };

beforeEach(() => {
  delete process.env.LIVE_AGENT_COMMIT;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  delete process.env.GITHUB_SHA;
});
afterEach(() => {
  process.env = { ...saved };
});

describe("deployedCommit", () => {
  it("is null with no commit in the environment", () => {
    expect(deployedCommit()).toBeNull();
  });

  it("reads Vercel's commit", () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "abc123";
    expect(deployedCommit()).toBe("abc123");
  });

  it("prefers an explicit override over the platform's", () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "abc123";
    process.env.LIVE_AGENT_COMMIT = "def456";
    expect(deployedCommit()).toBe("def456");
  });

  it("falls back to GitHub Actions' commit", () => {
    process.env.GITHUB_SHA = "gh789";
    expect(deployedCommit()).toBe("gh789");
  });
});

describe("promptHash", () => {
  it("is a 64-char hex digest, as the decision schema requires", () => {
    expect(promptHash()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for a given commit", () => {
    process.env.LIVE_AGENT_COMMIT = "abc123";
    expect(promptHash()).toBe(promptHash());
  });

  it("changes when the deployed commit changes", () => {
    process.env.LIVE_AGENT_COMMIT = "abc123";
    const first = promptHash();
    process.env.LIVE_AGENT_COMMIT = "def456";
    expect(promptHash()).not.toBe(first);
  });

  it("distinguishes a local run from a deployed one", () => {
    const local = promptHash();
    process.env.LIVE_AGENT_COMMIT = "abc123";
    expect(promptHash()).not.toBe(local);
  });
});

describe("provenance", () => {
  it("publishes the commit alongside the hash, so nothing is hidden by hashing", () => {
    process.env.LIVE_AGENT_COMMIT = "abc123";
    expect(provenance()).toMatchObject({ commit: "abc123" });
    expect(provenance().promptHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
