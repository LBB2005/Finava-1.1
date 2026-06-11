// Shared mutable state bridging the GSAP scroll timeline (DOM side) and the
// R3F scene (canvas side). Plain object — no three.js imports here so the DOM
// bundle stays lean. `p` is raw scroll progress; `ps` is the damped copy the
// scene reads. px/py are pointer parallax targets in [-1, 1].
export const story = {
  p: 0,
  ps: 0,
  px: 0,
  py: 0,
  pxS: 0,
  pyS: 0,
};

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
