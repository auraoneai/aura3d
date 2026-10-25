import { framecmp } from "./framecmp-lib";

framecmp([
  { slug: "kid-goku-beyond-the-clouds", hook: "__AURA_CUMULUS_DASH__", query: "?manual=1", steps: [
    { name: "run120", drive: `api.begin(); api.stepFrames(120, { steer: 0, jump: false, pole: false, glider: false, brake: false });` },
    { name: "steer240", drive: `api.stepFrames(240, { steer: 1, jump: false, pole: false, glider: false, brake: false });` }
  ] }
]);
