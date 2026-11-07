import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const files = []; (function w(d) { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) w(p); else if (e === "transcript.json") files.push(p); } })("/tmp/a3d515/ev");
const names = ["castShadow", "receiveShadow", "emissiveIntensity", "metalness", "roughness", "envMapIntensity", "transparent", "opacity", "wireframe", "flatShading", "density", "setSize", "setPixelRatio", "toneMapping", "clipAction", "OrbitControls", "Raycaster", "AnimationMixer", "Clock", "skyColor", "groundColor", "aces-filmic", "exp2", "\\.rotation\\.", "\\.position\\.", "metallic", "emissive", "decay", "angle", "penumbra", "autoRotate", "enableDamping", "mapSize", "normalBias", "bias", "rotation:", "side:"];
const c = {}; let n = 0;
for (const f of files) {
  if (!/aura/.test(f)) continue; let t; try { t = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
  const seen = new Set();
  for (const m of t) { if (!Array.isArray(m.content)) continue; for (const x of m.content) { if (x.type === "tool_use" && (x.name === "write_file" || x.name === "edit_file")) { const s = (x.input.content || "") + (x.input.new_string || x.input.new || ""); for (const nm of names) { if (new RegExp(nm).test(s)) seen.add(nm); } } } }
  n++; for (const s of seen) c[s] = (c[s] || 0) + 1;
}
console.log(n); for (const [k, v] of Object.entries(c).sort((a, b) => b[1] - a[1])) console.log(v, k);
