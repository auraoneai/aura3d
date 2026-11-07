import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const files = []; (function w(d) { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) w(p); else if (e === "transcript.json") files.push(p); } })("/tmp/a3d515/ev");
const names = ["Mesh\\b", "BoxGeometry", "MeshStandardMaterial", "PerspectiveCamera", "OrbitControls", "\\bClock\\b", "AnimationMixer", "clipAction", "Raycaster", "\\bPoints\\b", "\\bLine\\b", "\\bGroup\\b", "Object3D", "castShadow", "receiveShadow", "emissiveIntensity", "metalness", "roughness", "envMapIntensity", "wireframe", "flatShading", "transparent", "opacity", "setSize", "setPixelRatio", "toneMapping", "FogExp2|exp2", "ShaderMaterial", "uniforms", "InstancedMesh|setMatrixAt|setColorAt", "autoRotate", "enableDamping", "HemisphereLight|skyColor", "mapSize", "shadow\\.bias|normalBias", "BufferGeometry|setAttribute", "requestAnimationFrame", "dispose", "scene\\.add|\\.add\\(", "lookAt", "rotation\\.|rotateY|rotateX", "position\\.set", "THREE|three"];
const c = {}, runs = {}; let n = 0;
for (const f of files) {
  if (!/aura/.test(f)) continue; let t; try { t = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
  n++;
  const seen = new Set();
  for (const m of t) { if (!Array.isArray(m.content)) continue; for (const x of m.content) {
    if (x.type !== "tool_use") continue;
    let q = "";
    if (x.name === "search") q = String(x.input.pattern ?? x.input.query ?? "");
    else if (x.name === "aura_lookup") q = String(x.input.query ?? "");
    else continue;
    for (const nm of names) if (new RegExp(nm, "i").test(q)) { seen.add(nm); c[nm] = (c[nm] || 0) + 1; }
  } }
  for (const s of seen) runs[s] = (runs[s] || 0) + 1;
}
console.log("aura runs", n);
for (const [k, v] of Object.entries(c).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(5), String(runs[k]).padStart(4), k);
