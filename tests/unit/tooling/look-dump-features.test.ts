import { describe, expect, it } from "vitest";
import { analyzeSource, compareWithPort, parseNotPorted } from "../../../tools/crayon-capture/look-dump-features-lib.js";

const SRC = `
import { Mesh, BoxGeometry, MeshToonMaterial as Toon } from "three";
const SPEEDS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16];
const LEVELS = [{name:"a",len:1},{name:"b",len:2},{name:"c",len:3},{name:"d",len:4},{name:"e",len:5},{name:"f",len:6},{name:"g",len:7},{name:"h",len:8}];
function screenName(s){ switch(s){ case "title": case "pause": case "results": case "gameover": return 1; } }
document.addEventListener("keydown", e => { if (e.code === "ArrowLeft" || e.code === "Space") go(); });
const ctx = new AudioContext(); const o = ctx.createOscillator(); o.type = "triangle";
localStorage.setItem("best", "1");
const m = new Mesh(new BoxGeometry(1,1,1), new Toon({}));
const fs = "precision highp float; uniform float uTime; varying vec2 vUv; void main(){ gl_FragColor = vec4(vUv, uTime, 1.0); }";
const label = "GAME OVER";
const bloomPass = 1;
function big(){ ${"x = x + 1;".repeat(80)} }
`;

describe("look-dump-features-lib", () => {
  const map = analyzeSource("g", [{ file: "a.js", text: SRC }]);

  it("records constructions through import aliases", () => {
    expect(map.three.constructed).toMatchObject({ Mesh: 1, BoxGeometry: 1, MeshToonMaterial: 1 });
  });

  it("finds screens, inputs, audio, storage and data tables with locations", () => {
    expect(map.screens.map((s) => s.screen)).toEqual(expect.arrayContaining(["title", "pause", "results", "game-over"]));
    expect(map.inputs.keys.map((k) => k.key)).toEqual(expect.arrayContaining(["ArrowLeft", "Space"]));
    expect(map.inputs.listeners[0]).toMatchObject({ event: "keydown" });
    expect(map.audio.oscillatorTypes).toEqual(["triangle"]);
    expect(map.storage[0]).toMatchObject({ store: "localStorage", op: "setItem", key: "best" });
    expect(map.dataTables.map((t) => t.kind)).toEqual(expect.arrayContaining(["numeric-array", "object-array"]));
    expect(map.stateSwitches[0]?.cases).toEqual(["title", "pause", "results", "gameover"]);
    const first = map.screens[0]?.first[0];
    expect(first?.line).toBeGreaterThan(0);
  });

  it("extracts shader uniforms and post-fx words without storing source", () => {
    expect(map.shaders[0]).toMatchObject({ kind: "glsl", uniforms: ["uTime"], varyings: ["vUv"] });
    expect(map.postFx.map((p) => p.word)).toContain("bloom");
    expect(JSON.stringify(map)).not.toContain("gl_FragColor");
    expect(map.functions[0]?.name).toBe("big");
  });

  it("compares with a port and parses its Not ported bullets", () => {
    const cmp = compareWithPort(map, "const x = 1; // no audio, no pause");
    expect(cmp.find((c) => c.feature === "audio")?.port).toBe("absent");
    expect(compareWithPort(map, "new AudioContext(); keydown").find((c) => c.feature === "audio")?.port).toBe("present");
    const notes = "# Port\n## Not ported\n- Audio is not ported.\n- Leaderboard.\n## Other\n- ignored\n";
    expect(parseNotPorted(notes)).toEqual(["Audio is not ported.", "Leaderboard."]);
  });
});
