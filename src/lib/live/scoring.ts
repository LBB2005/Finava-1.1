// Pointer to the pre-registered scoring method.
//
// SCORING.md lives in the public finava-live repo and was committed BEFORE the
// first decision existed. Its hash is republished in every day's export so a
// reader can confirm that the method a day was scored under is the method that
// was registered — not one chosen after the results came in. A scoring method
// selected retroactively is not a measurement, and from the outside the two are
// indistinguishable unless the method is pinned like this.
//
// If SCORING.md is ever revised, this constant changes in the same commit and
// days published afterwards carry the new hash. The change is then visible as a
// discontinuity in the published record, which is the intended and only
// acceptable way for it to happen.

/** sha256 of finava-live/SCORING.md at the commit named below. */
export const SCORING_SHA256 =
  "ce3549690d98509c171fbb5100ca9027410417e67f359ad61cfb9248efac8cd2";

/** The finava-live commit that introduced this version of the method. */
export const SCORING_COMMIT = "bd74c7a";

/** Version label, bumped alongside any revision to SCORING.md. */
export const SCORING_VERSION = "v1";

export function scoringRegistration() {
  return {
    version: SCORING_VERSION,
    sha256: SCORING_SHA256,
    commit: SCORING_COMMIT,
    document: "SCORING.md",
    note:
      "Pre-registered before the first decision. Recompute with " +
      "`shasum -a 256 SCORING.md` on the named commit.",
  };
}
