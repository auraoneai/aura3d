import { shotsb } from "./shotsb-lib";

shotsb({
  slug: "craterline-gp", folder: "strange-orbit-port", hook: "__AURA_STRANGE_ORBIT__",
  titleQuery: "", manualQuery: "?manual=1", card: "boost",
  states: [
    { name: "start", drive: `api.begin(); api.stepFrames(60, { pedal: true });` },
    { name: "boost", drive: `api.stepFrames(240, { pedal: true }); api.stepFrames(60, { pedal: true, boost: true });` },
    { name: "mid-action", drive: `api.setAutopilot(true); api.stepFrames(900);` },
    { name: "impact", drive: `api.setAutopilot(false); const c = api.colliders(); const pick = c.find((x) => /pillar|gate|lintel|boulder/i.test(x.label)) || c[0]; api.flyInto(pick.id, 35); api.stepFrames(24, { pedal: true });` },
    { name: "results", drive: `api.reset(); api.setAutopilot(true); api.runToFinish();`, settle: 6 }
  ]
});
