// Browser copy of the bridge's seeded random (packages/aura3d-cli/src/import-three/headless.ts seededRandom).
// Same mulberry32 sequence, so the three.js original and the headless export build identical scenes.
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
