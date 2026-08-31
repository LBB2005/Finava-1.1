// A fingerprint of the agent configuration a decision was made under.
//
// Recorded on every decision so a reader can ask "was this made by the same
// system as that one?" without taking our word for it. AGENT_VERSION is a label
// a human types and could be forgotten on a prompt change; the commit SHA is
// derived, so a changed prompt changes the fingerprint whether or not anyone
// remembered to bump the label. Together they are the answer to "you tuned it
// until it worked" — every decision names the code that made it, and the code is
// public.
//
// The SHA rather than a hash of the source files on disk: Vercel does not deploy
// the .ts sources, so a filesystem hash would silently degrade to hashing
// nothing in exactly the environment that matters. A commit SHA is available in
// every environment, is stable for the life of a deployment, and — unlike a hash
// only we can compute — anyone can check out that commit and read the prompts.

import { createHash } from "node:crypto";
import { AGENT_VERSION } from "./version";

/** The deployed commit, or null when running somewhere that doesn't set one. */
export function deployedCommit(): string | null {
  return (
    process.env.LIVE_AGENT_COMMIT ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    null
  );
}

/**
 * sha256 over the declared version and the deployed commit.
 *
 * Hashed rather than published raw so the field is fixed-width and matches the
 * schema's `.length(64)`; the commit itself is published separately in each
 * day's export, so nothing is hidden by the hashing.
 *
 * When no commit is available — local development — the fingerprint covers the
 * version alone and is marked as such. That is a weaker guarantee, and it is
 * meant to be visible: a published day whose provenance says "local" is a day
 * whose code nobody can go and read.
 */
export function promptHash(): string {
  const commit = deployedCommit();
  return createHash("sha256")
    .update(AGENT_VERSION)
    .update(":")
    .update(commit ?? "local")
    .digest("hex");
}

/** Provenance for the published record. */
export function provenance(): { agentVersion: string; commit: string | null; promptHash: string } {
  return { agentVersion: AGENT_VERSION, commit: deployedCommit(), promptHash: promptHash() };
}
