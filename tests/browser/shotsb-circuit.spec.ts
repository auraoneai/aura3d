import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { shotsb } from "./shotsb-lib";

// the strike replay (gun held down) from heatsink-strike.spec.ts: deterministic, same inputs every run. The countdown
// banner is no longer force-hidden: the GO banner clears on its own 0.8 s into the race (HP-01).
const ref = JSON.parse(readFileSync(resolve("tests/browser/data/heatsink-reference-replay.json"), "utf8")) as { script: { text: string } };
const withFire = ref.script.text.split("\n").map((line) => {
  const m = /^(\d+x t\S+ b\S+ s\S+) (\S+)$/.exec(line.trim());
  if (!m) return line;
  const flags = m[2] === "-" ? "F" : m[2]!.includes("F") ? m[2]! : `${m[2]}F`;
  return `${m[1]} ${flags}`;
}).join("\n");
const text = JSON.stringify(withFire);

shotsb({
  slug: "ion-circuit", folder: "heatsink-port", hook: "__AURA_HEATSINK__",
  titleQuery: "?quality=low", manualQuery: "?manual=1&quality=low", card: "strike",
  desktop: { width: 640, height: 360 }, lowQuality: true,
  states: [
    { name: "early", drive: `api.stepFrames(30);` },
    { name: "start", drive: `api.replayStart(${text}); api.replayTo(120, 30);` },
    { name: "strike", drive: `api.replayTo(323, 3);` },
    { name: "mid-action", drive: `api.replayTo(1148, 3);` },
    // a finished race driven by the lane-follow bot (examples/heatsink-port/bot.ts), so the results card is a real one
    { name: "results", drive: `api.autopilot({ speed: 80, lead: 6 });`, settle: 6 }
  ]
});
