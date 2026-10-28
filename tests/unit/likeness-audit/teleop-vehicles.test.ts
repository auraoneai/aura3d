import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const require = createRequire(join(root, "package.json"));

// asset key -> generated vehicle (see tools/teleoperator-vehicles/apply.mjs)
const KEYS = [
  "teleopWaymoHero",
  "teleopWaymoTraffic",
  "teleopCybercab",
  "teleopCybertruck",
  "teleopCorvette",
  "teleopMissions",
  "teleopSedan",
  "teleopTaxi",
  "teleopSuv",
  "teleopVan",
  "teleopPickup",
  "teleopBus"
];

const OLD_FILES = [
  "teleopWaymoHero.6d2a9bfb.glb",
  "teleopWaymoTraffic.f476abe7.glb",
  "teleopCybercab.08358a58.glb",
  "teleopCybertruck.6aa8f5c4.glb",
  "teleopCorvette.e7009c34.glb",
  "teleopMissions.6996bfa9.glb",
  "teleopSedan.glb",
  "teleopTaxi.glb",
  "teleopSuv.glb",
  "teleopVan.glb",
  "teleopPickup.glb",
  "teleopBus.glb"
];

const TRIANGLE_BUDGET = 42_000;
const manifest = JSON.parse(readFileSync(join(root, "aura.assets.json"), "utf8")) as { assets: Array<Record<string, unknown>> };
const typed = readFileSync(join(root, "src/aura-assets.ts"), "utf8");

function entry(key: string): Record<string, unknown> {
  const found = manifest.assets.find((a) => a.name === key);
  if (!found) throw new Error(`manifest entry ${key} missing`);
  return found;
}

describe("Teleoperator vehicles are the generic generated set", () => {
  it("points every vehicle key at a generated file whose bytes match the manifest hash", () => {
    for (const key of KEYS) {
      const e = entry(key);
      const url = String(e.url);
      expect(url, key).toMatch(/^\/aura-assets\/teleopVeh[A-Za-z]+\.[0-9a-f]{8}\.glb$/);
      const file = join(root, "public", url);
      expect(existsSync(file), `${key} file`).toBe(true);
      const bytes = readFileSync(file);
      expect(createHash("sha256").update(bytes).digest("hex"), `${key} sha256`).toBe(e.sha256);
      expect(bytes.length, `${key} size`).toBe(e.byteLength);
      expect(String(e.license), `${key} license`).toMatch(/Meshy generated asset/);
    }
  });

  it("keeps src/aura-assets.ts and the Teleoperator apps in step with the manifest", () => {
    for (const key of KEYS) {
      const e = entry(key);
      const start = typed.indexOf(`\n  "${key}": {\n`);
      expect(start, `${key} typed block`).toBeGreaterThan(-1);
      const block = typed.slice(start, typed.indexOf("\n  },\n", start));
      expect(block, `${key} typed url`).toContain(`url: "${String(e.url)}"`);
      expect(block, `${key} typed hash`).toContain(`hash: "sha256-${String(e.sha256)}"`);
      for (const app of ["apps/showcase-teleoperator/src/main.ts"]) {
        const src = readFileSync(join(root, app), "utf8");
        const local = new RegExp(`  ${key}: \\{[\\s\\S]*?url: "([^"]+)"[\\s\\S]*?hash: "([^"]+)"`).exec(src);
        if (!local) continue;
        expect(local[1], `${app} ${key} url`).toBe(String(e.url));
        expect(local[2], `${app} ${key} hash`).toBe(`sha256-${String(e.sha256)}`);
      }
    }
  });

  it("no longer ships or references the previous vehicle files", () => {
    for (const old of OLD_FILES) {
      expect(existsSync(join(root, "public/aura-assets", old)), `${old} removed`).toBe(false);
      expect(typed.includes(old), `${old} in src/aura-assets.ts`).toBe(false);
      expect(JSON.stringify(manifest).includes(old), `${old} in aura.assets.json`).toBe(false);
    }
  });

  it("keeps every generated vehicle inside the triangle budget and free of brand words in the route notes", async () => {
    const { NodeIO } = require("@gltf-transform/core");
    const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
    const { MeshoptDecoder } = require("meshoptimizer");
    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
    const files = new Set(KEYS.map((k) => String(entry(k).url)));
    expect(files.size).toBe(8);
    for (const url of files) {
      const doc = await io.read(join(root, "public", url));
      let tris = 0;
      for (const mesh of doc.getRoot().listMeshes())
        for (const prim of mesh.listPrimitives()) {
          const idx = prim.getIndices();
          tris += (idx ? idx.getCount() : prim.getAttribute("POSITION").getCount()) / 3;
        }
      expect(tris, url).toBeLessThanOrEqual(TRIANGLE_BUDGET);
    }
    const notes = JSON.parse(readFileSync(join(root, "apps/showcase-teleoperator/route-health.json"), "utf8")).notes as string;
    expect(notes).not.toMatch(/waymo|tesla|jaguar|i-pace|corvette|cybertruck|cybercab|spacex|mindblown/i);
  });
});
