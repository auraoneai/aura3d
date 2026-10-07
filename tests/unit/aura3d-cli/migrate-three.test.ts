import { describe, expect, it } from "vitest";
import { emitMigratedSource } from "../../../packages/aura3d-cli/src/migrate-three/emit";
import { buildMigrateReport } from "../../../packages/aura3d-cli/src/migrate-three/report";

// PRD-15 T6.1: one fixture per mapping-table row plus an unmapped fixture.

describe("aura3d migrate three", () => {
  const cases: Readonly<Record<string, { readonly source: string; readonly expectContains: string[]; readonly mapping: string }>> = {
    Scene: { source: `import * as THREE from "three";\nconst s = new THREE.Scene();`, expectContains: ["scene()", "@aura3d/engine"], mapping: "approximate" },
    PerspectiveCamera: { source: `import * as THREE from "three";\nconst c = new THREE.PerspectiveCamera(50, 1.6, 0.1, 100);`, expectContains: ["camera.perspective()", "map args (50, 1.6, 0.1, 100)"], mapping: "approximate" },
    Mesh: { source: `import * as THREE from "three";\nconst m = new THREE.Mesh(geo, mat);`, expectContains: ["primitives()", "map args (geo, mat)"], mapping: "approximate" },
    BoxGeometry: { source: `new THREE.BoxGeometry(1, 2, 1)`, expectContains: ["primitives.box()", "map args (1, 2, 1)"], mapping: "approximate" },
    SphereGeometry: { source: `new THREE.SphereGeometry(0.5)`, expectContains: ["primitives.sphere()"], mapping: "approximate" },
    CylinderGeometry: { source: `new THREE.CylinderGeometry(0.2, 0.2, 1)`, expectContains: ["primitives.cylinder()"], mapping: "approximate" },
    PlaneGeometry: { source: `new THREE.PlaneGeometry(10, 10)`, expectContains: ["primitives.plane()"], mapping: "approximate" },
    TorusGeometry: { source: `new THREE.TorusGeometry(1, 0.3)`, expectContains: ["primitives.torus()"], mapping: "approximate" },
    MeshStandardMaterial: { source: `new THREE.MeshStandardMaterial({ color: 0xff0000 })`, expectContains: ["material.pbr()"], mapping: "approximate" },
    MeshPhysicalMaterial: { source: `new THREE.MeshPhysicalMaterial({ clearcoat: 1, transmission: 0.9, sheen: 0.5 })`, expectContains: ["material.physical()"], mapping: "approximate" },
    DirectionalLight: { source: `new THREE.DirectionalLight(0xffffff, 2)`, expectContains: ["lights.directional()"], mapping: "approximate" },
    PointLight: { source: `new THREE.PointLight(0xffaa00, 1, 10)`, expectContains: ["lights.point()"], mapping: "approximate" },
    SpotLight: { source: `new THREE.SpotLight(0xffffff, 4)`, expectContains: ["lights.spot()"], mapping: "approximate" },
    AmbientLight: { source: `new THREE.AmbientLight(0x404040)`, expectContains: ["lights.ambient()"], mapping: "approximate" },
    HemisphereLight: { source: `new THREE.HemisphereLight(0x87ceeb, 0x362d1f)`, expectContains: ["lights.ambient()", "hemisphere"], mapping: "approximate" },
    "GLTFLoader.load": { source: `const loader = new THREE.GLTFLoader();\nloader.load("hero.glb");`, expectContains: ["TODO(a3d-migrate): GLTFLoader.load → model"], mapping: "approximate" },
    "RGBELoader.load": { source: `const loader = new THREE.RGBELoader();\nloader.load("env.hdr");`, expectContains: ["TODO(a3d-migrate): RGBELoader.load → environments.hdri"], mapping: "approximate" },
    OrbitControls: { source: `new THREE.OrbitControls(camera, renderer.domElement)`, expectContains: ["camera.orbit()"], mapping: "approximate" },
    InstancedMesh: { source: `new THREE.InstancedMesh(geo, mat, 100)`, expectContains: ["instances.box()"], mapping: "approximate" },
    "Euler XYZ order": { source: `const e = new THREE.Euler(0.1, 0.2, 0.3, "XYZ");`, expectContains: ["[0.1, 0.2, 0.3]"], mapping: "approximate" },
    "unmapped construct": { source: `new THREE.PositionalAudio(listener)`, expectContains: ["no mapping for PositionalAudio"], mapping: "none" },
  };

  for (const [name, { source, expectContains, mapping }] of Object.entries(cases)) {
    it(`maps ${name}`, () => {
      const { code, rows } = emitMigratedSource(source);
      for (const needle of expectContains) expect(code, name).toContain(needle);
      const row = rows.find((r) => r.mapping === mapping);
      expect(row, name).toBeDefined();
      expect(row?.note).toBeTruthy();
    });
  }

  it("report carries {construct,line,mapping,note} rows and counts", () => {
    const { rows } = emitMigratedSource(`import * as THREE from "three";\nnew THREE.Scene();\nnew THREE.PositionalAudio(l)`);
    const report = buildMigrateReport(rows);
    expect(report.counts.none).toBe(1);
    expect(report.rows.some((r) => r.construct === "PositionalAudio" && r.line === 3)).toBe(true);
  });
});
