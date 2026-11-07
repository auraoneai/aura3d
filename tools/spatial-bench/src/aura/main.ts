// Aura3D viewer. Uses ONLY the current public API of @aura3d/engine (workspace source):
//   static points   -> points({ positions: Float32Array, colors: AuraColor[], size })   (no live update path: E6-00 U.12)
//   streamed points -> geometry.custom(geometry.dynamic({ topology: "points", ... })) + handle.updateAttribute (the only mutable path: P.3)
//   instances       -> instances.box({ transforms }) + handle.setInstanceMatrices(Float32Array, count)
//   trajectories    -> lines.segments({ positions }) + handle.updateAttribute("position", ...)
//   picking         -> raycast({ camera, ndc }, { handles, mode: "mesh" })
//   camera          -> app.camera.setPose; label projection from app.camera.evidence().viewProjection
import { camera, createAuraApp, geometry, instances, lights, lines, material, points, raycast, scene } from "@aura3d/engine";
import { runBench, type Viewer } from "../common/harness";
import type { Cfg, SpatialData } from "../common/data";

type Handle = {
  updateAttribute?: (name: string, update: { array: ArrayLike<number>; offset?: number }) => unknown;
  setGeometry?: (g: unknown) => unknown;
  setInstanceMatrices?: (m: Float32Array, count: number, rgba?: Float32Array) => unknown;
};

function hex(n: number): string {
  return (n < 16 ? "0" : "") + n.toString(16);
}

function createViewer(): Viewer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let cfg: Cfg;
  let data: SpatialData;
  let pointsHandle: Handle | null = null;
  let instHandle: Handle | null = null;
  let segHandle: Handle | null = null;
  let size = { width: 1, height: 1 };
  let pointsMode: "static" | "dynamic" | "none" = "none";
  let rgbaScratch: Float32Array | null = null;
  const pointsMaterial = () => material.pbr({ color: "#ffffff", roughness: 1, metalness: 0 });

  return {
    async init(canvas, c, d, s) {
      cfg = c; data = d; size = s;
      const notes: string[] = [];
      const details: Record<string, unknown> = {};
      const stage = scene({ background: "#05070b" })
        .camera(camera.perspective({ fov: 50, position: [40, 14, 0], target: [0, 0, 0], near: 0.1, far: 500 }))
        .add(lights.ambient({ intensity: 1.2 }))
        .add(lights.directional({ position: [10, 20, 8], intensity: 1.5 }));

      if (c.points > 0) {
        if (c.rateHz === 0) {
          pointsMode = "static";
          // points(): positions accept a Float32Array (converted internally to one JS [x,y,z] array per point, E6-00 P.1);
          // colors accept only AuraColor strings, one per point: pay the conversion here.
          const t0 = performance.now();
          const pk = d.pointColors[0]!;
          const colors: string[] = new Array(c.points);
          for (let i = 0; i < c.points; i++) colors[i] = "#" + hex(pk[i * 4]!) + hex(pk[i * 4 + 1]!) + hex(pk[i * 4 + 2]!);
          const convertMs = performance.now() - t0;
          const t1 = performance.now();
          const node = points({ positions: d.pointPositions[0]!, colors, size: 1.5, sizeAttenuation: false });
          const nodeMs = performance.now() - t1;
          details.points = { path: "points()", colorConvertMs: convertMs, builderMs: nodeMs };
          notes.push("points(): static after mount, colors via per-point CSS color strings");
          stage.add(node);
        } else {
          pointsMode = "dynamic";
          const t0 = performance.now();
          rgbaScratch = new Float32Array(c.points * 4);
          const pk = d.pointColors[0]!;
          for (let i = 0; i < rgbaScratch.length; i++) rgbaScratch[i] = pk[i]! / 255;
          const convertMs = performance.now() - t0;
          const spec = geometry.dynamic({ positions: new Float32Array(d.pointPositions[0]!), colors: rgbaScratch, topology: "points" });
          details.points = { path: "geometry.dynamic(topology points) + updateAttribute", initialColorConvertMs: convertMs };
          notes.push("streamed points: geometry.dynamic points + updateAttribute (position, color); colors need float RGBA");
          stage.add(geometry.custom(spec, { name: "pts", material: pointsMaterial(), castShadow: false, receiveShadow: false }).runtime({ id: "pts" }));
        }
      }
      if (c.instances > 0) {
        const transforms = Array.from({ length: c.instances }, () => ({ position: [0, 0, 0] as [number, number, number] }));
        stage.add(instances.box({ transforms, material: material.pbr({ color: "#d8c25a", roughness: 0.6, metalness: 0 }), castShadow: false, receiveShadow: false }).runtime({ id: "inst" }));
      }
      if (c.segments > 0) {
        stage.add(lines.segments({ positions: d.segmentPositions[0]!, material: material.pbr({ color: "#55ddff" }) }).runtime({ id: "segs" }));
      }

      app = createAuraApp(canvas, { scene: stage, autoStart: false, resize: false, pixelRatio: 1 });
      await app.ready();
      if (c.points > 0 && pointsMode === "dynamic") pointsHandle = app.nodes.require("pts");
      if (c.instances > 0) {
        instHandle = app.nodes.require("inst");
        if (typeof instHandle.setInstanceMatrices !== "function") throw new Error("setInstanceMatrices not available on instance handle");
        instHandle.setInstanceMatrices(d.instanceMatrices[0]!, c.instances);
      }
      if (c.segments > 0) segHandle = app.nodes.require("segs");
      app.step(1 / 60);
      return { library: "aura3d", version: "workspace@" + (typeof __AURA_COMMIT__ === "string" ? __AURA_COMMIT__ : "unknown"), notes, details };
    },
    applyTick(slot) {
      let convertMs = 0;
      if (pointsHandle) {
        const t0 = performance.now();
        const pk = data.pointColors[slot]!;
        const out = rgbaScratch!;
        for (let i = 0; i < out.length; i++) out[i] = pk[i]! / 255;
        convertMs = performance.now() - t0;
        pointsHandle.updateAttribute!("position", { array: data.pointPositions[slot]! });
        pointsHandle.updateAttribute!("color", { array: out });
      }
      if (instHandle) instHandle.setInstanceMatrices!(data.instanceMatrices[slot]!, cfg.instances);
      if (segHandle) segHandle.updateAttribute!("position", { array: data.segmentPositions[slot]! });
      return convertMs;
    },
    setCamera(pose) {
      app.camera.setPose({ position: pose.position, target: pose.target });
    },
    render(dt) {
      app.step(dt);
    },
    gpuSample() {
      const t = app.diagnostics?.()?.renderer?.frameTiming;
      return t ? { ms: t.gpuMs, reason: t.gpuReason } : { ms: null, reason: "diagnostics().renderer.frameTiming absent" };
    },
    viewProjection() {
      return app.camera.evidence().viewProjection;
    },
    pick(ndc, kind) {
      const handle = kind === "points" ? app.nodes.get("pts") : app.nodes.get("inst");
      if (!handle) return { hits: 0, status: "no pickable handle: " + (kind === "points" ? (pointsMode === "static" ? "points() nodes expose no handle path" : "none") : "none"), usable: false };
      const pose = app.camera.presented();
      let hits = 0;
      for (const [x, y] of ndc) {
        const r = raycast({ camera: { position: pose.position, target: pose.target, up: pose.up, fov: pose.fov, aspect: size.width / size.height, near: pose.near, far: pose.far }, ndc: [x, y] }, { handles: [handle], mode: "mesh", firstHitOnly: false });
        hits += r.length;
      }
      return {
        hits,
        status: kind === "points" ? "raycast(mode mesh) over the points primitive: mesh mode returns [] for non-triangle topology (E6-00 K.5)" : "raycast(mode mesh) over instances.box (per-instance triangle scan)",
        usable: hits > 0 || kind === "instances"
      };
    }
  };
}

declare const __AURA_COMMIT__: string | undefined;
void runBench(createViewer, "aura");
