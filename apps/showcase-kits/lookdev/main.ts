// apps/showcase-kits/lookdev/main.ts — PRD-14 T3.1 look-dev page (scaffold).
// Internal only, never deployed. Loads one kit manifest by query
// (`?kit=K2&hdri=studio-small-08-1k`) and renders a material-ladder turntable
// subject in Aura under the selected K1 HDRI, next to the kit's file table and
// look-dev verdicts.
//
// The three r185 reference pane (which decides approval, PRD-14 §6.4) is not
// wired in this scaffold: tests/unit/agent-api/public-example-boundary.test.ts
// (lane 15) forbids `three` imports under apps/showcase-*/ outside the
// art-review/scripts folders. Until that boundary admits
// apps/showcase-kits/lookdev/, the pane states that and no verdict can move
// off "pending".
import {
  camera,
  createAuraApp,
  defineAuraAssets,
  environments,
  lights,
  material,
  primitives,
  scene,
  type AuraNodeInput
} from "@aura3d/engine";

interface LookDev {
  readonly runId: string | null;
  readonly reviewer: string | null;
  readonly verdict: "pending" | "accept" | "reject";
}
interface KitFile {
  readonly id: string;
  readonly kind: string;
  readonly path: string;
  readonly licence: string;
  readonly sha256: string;
  readonly triangles: number | null;
  readonly lookdev: LookDev;
}
interface KitManifest {
  readonly kit: string;
  readonly name: string;
  readonly lookdev: LookDev;
  readonly files: readonly KitFile[];
}

declare global {
  interface Window {
    __AURA3D_KITS_LOOKDEV__?: {
      readonly kit: string;
      readonly hdri: string;
      readonly kitVerdict: LookDev["verdict"];
      readonly fileVerdicts: Record<string, LookDev["verdict"]>;
      readonly threePane: "pending-boundary-exemption";
      readonly backend: string;
    };
  }
}

const KITS = ["K1", "K2", "K3", "K4", "K5", "K6", "K7", "K9"] as const;
const BASE = "/apps/showcase-kits";

const params = new URLSearchParams(window.location.search);
const kitId = (KITS as readonly string[]).includes(params.get("kit") ?? "") ? (params.get("kit") as string) : "K1";

const [k1, kit] = await Promise.all([loadKit("K1"), loadKit(kitId)]);
const hdriFiles = k1.files.filter((f) => f.kind === "environment");
const hdri = hdriFiles.find((f) => f.id === params.get("hdri")) ?? hdriFiles.find((f) => f.id === "studio-small-08-1k") ?? hdriFiles[0];
if (hdri === undefined) throw new Error("K1 kit.json has no environment file to light the look-dev pane");

const env = defineAuraAssets({
  lookdevHdri: {
    type: "texture",
    format: "hdr",
    url: `/${hdri.path}`,
    hash: `sha256-${hdri.sha256}`,
    metadata: { license: hdri.licence, sourcePath: hdri.path }
  }
});

renderControls();
renderManifest(kit);
renderThreePane();

const app = createAuraApp("#aura", {
  diagnostics: { overlay: false, performancePanel: false },
  pixelRatio: Math.min(1.5, window.devicePixelRatio || 1),
  scene: scene()
    .background("#14181d")
    .addMany(materialLadder())
    .add(environments.hdri({ name: `K1 ${hdri.id}`, texture: env.lookdevHdri, intensity: 1 }))
    .add(lights.directional({ name: "look-dev key", position: [-3, 5, 4], intensity: 1.2, color: "#ffffff", shadow: true }))
    .camera(camera.perspective({ position: [0, 1.4, 6.2], target: [0, 0.6, 0], fov: 35 }))
});

window.__AURA3D_KITS_LOOKDEV__ = {
  kit: kit.kit,
  hdri: hdri.id,
  kitVerdict: kit.lookdev.verdict,
  fileVerdicts: Object.fromEntries(kit.files.map((f) => [f.id, f.lookdev.verdict])),
  threePane: "pending-boundary-exemption",
  backend: String(app.backend)
};

async function loadKit(id: string): Promise<KitManifest> {
  const response = await fetch(`${BASE}/${id}/kit.json`);
  if (!response.ok) throw new Error(`kit.json for ${id}: HTTP ${response.status}`);
  return (await response.json()) as KitManifest;
}

/** Five spheres from rough dielectric to polished metal: the neutral subject until kit GLBs are staged. */
function materialLadder(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [
    primitives.box({
      name: "look-dev floor",
      material: material.pbr({ color: "#2a2f35", roughness: 0.85, metallic: 0 })
    }).position(0, -0.05, 0).scale([7, 0.05, 3])
  ];
  for (let i = 0; i < 5; i += 1) {
    const t = i / 4;
    nodes.push(
      primitives.sphere({
        name: `ladder ${i}`,
        castShadow: true,
        material: material.pbr({ color: "#c9c4bb", roughness: 0.9 - 0.8 * t, metallic: t })
      }).position(-2.4 + 1.2 * i, 0.5, 0).scale(0.5)
    );
  }
  return nodes;
}

function renderControls(): void {
  const kitSelect = document.querySelector<HTMLSelectElement>("#kit");
  const hdriSelect = document.querySelector<HTMLSelectElement>("#hdri");
  if (kitSelect === null || hdriSelect === null) throw new Error("look-dev controls missing from index.html");
  kitSelect.replaceChildren(...KITS.map((id) => new Option(id, id, false, id === kitId)));
  hdriSelect.replaceChildren(...hdriFiles.map((f) => new Option(f.id, f.id, false, f.id === hdri?.id)));
  const navigate = () => {
    const next = new URLSearchParams({ kit: kitSelect.value, hdri: hdriSelect.value });
    window.location.search = next.toString();
  };
  kitSelect.addEventListener("change", navigate);
  hdriSelect.addEventListener("change", navigate);
}

function renderManifest(manifest: KitManifest): void {
  const host = document.querySelector<HTMLElement>("#manifest");
  if (host === null) throw new Error("#manifest missing from index.html");
  const heading = document.createElement("h3");
  heading.textContent = `${manifest.kit} ${manifest.name}: kit verdict ${manifest.lookdev.verdict}`;
  const table = document.createElement("table");
  const head = table.createTHead().insertRow();
  for (const label of ["file", "kind", "licence", "tris", "verdict"]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    head.append(th);
  }
  const body = table.createTBody();
  for (const f of manifest.files) {
    const row = body.insertRow();
    for (const value of [f.id, f.kind, f.licence, f.triangles === null ? "n/a" : String(f.triangles), f.lookdev.verdict]) {
      row.insertCell().textContent = value;
    }
  }
  const empty = document.createElement("p");
  empty.textContent = manifest.files.length === 0 ? "No candidate files staged yet." : "";
  host.replaceChildren(heading, table, empty);
}

function renderThreePane(): void {
  const pane = document.querySelector<HTMLElement>("#three");
  if (pane === null) throw new Error("#three missing from index.html");
  pane.textContent =
    "three r185 reference pane pending: the lane-15 public-example boundary test forbids three imports under apps/showcase-*/. " +
    "Verdicts stay pending until this pane renders.";
}
