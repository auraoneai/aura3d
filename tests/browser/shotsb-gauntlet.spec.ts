import { shotsb } from "./shotsb-lib";

const RAM = `const z = api.state; const b = z.entities.find((e) => e.type === "barrier" && e.alive && e.s > 200);
z.entities.forEach((e) => { if (e !== b && e.type !== "chakra") e.alive = false; });
b.lane = 0; z.x = 0; z.s = b.s - 9; z.time = 40; z.y = 0; z.vy = 0; api.stepFrames(0);
for (let i = 0; i < 400; i++) { api.stepRaw(1); if (z.health < 5 || !z.entities.find((e) => e.s === b.s && e.alive)) break; } api.settle(3, 0.12);`;

shotsb({
  slug: "shadowstep-gauntlet", folder: "ninja-runner-port", hook: "__AURA_NINJA_RUNNER__",
  titleQuery: "", manualQuery: "?manual=1", card: "run",
  states: [
    { name: "early", drive: `api.begin(); api.stepFrames(60);` },
    { name: "run", drive: `api.stepFrames(240);` },
    { name: "action", drive: `api.applyInput("jump"); api.stepFrames(30); api.applyInput("rasengan"); api.stepFrames(20);` },
    { name: "gate-hit", drive: `api.begin(); ${RAM}` },
    { name: "mid-action", drive: `api.begin(); api.setAutopilot(true); api.stepFrames(1800);` },
    { name: "results", drive: `api.setAutopilot(true); api.advanceTo(1e9, [], 60000);`, settle: 8 }
  ]
});
