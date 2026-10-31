import { shotsb } from "./shotsb-lib";

shotsb({
  slug: "gridlock-courier", folder: "drift-and-deliver-port", hook: "__AURA_DRIFT_AND_DELIVER__",
  titleQuery: "", manualQuery: "?manual=1", card: "drift",
  // GU47 phase 3: chunks keep each remote run under the 1 h ACR cap (the whole desktop pass timed out on software GL)
  chunks: [{ name: "run", states: ["early", "drive", "drift"] }, { name: "pickup", states: ["pickup"] }, { name: "action", states: ["mid-action"] }],
  states: [
    { name: "early", drive: `api.reset(); api.teleport(30, -300, 0); api.stepFrames(0);` },
    { name: "drive", drive: `api.stepFrames(240, { w: true });` },
    { name: "drift", drive: `api.stepFrames(30, { w: true, d: true, space: true });` },
    { name: "pickup", drive: `api.reset(); let got = false; const list = api.pickups().filter((x) => !x.taken).slice(0, 30); for (const p of list) { const before = api.state().collected; api.teleport(p.x, p.z - 24, 0); api.stepFrames(50, { w: true }); if (api.state().collected > before) { got = true; break; } } if (!got) throw new Error("no pickup collected in 30 tries");` },
    { name: "mid-action", drive: `api.reset(); api.teleport(30, -300, 0); api.stepFrames(200, { w: true, shift: true });` }
  ]
});
