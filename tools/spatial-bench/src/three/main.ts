// three.js viewer. Protocol from E6-00 section 5.3: Float32 positions + normalized Uint8 colors on BufferGeometry/Points,
// update by writing into the attribute arrays + needsUpdate, InstancedMesh with direct array copy (or setMatrixAt loop),
// LineSegments for trajectories, Raycaster for picking.
import * as THREE from "three";
import { runBench, type Viewer } from "../common/harness";
import type { Cfg, SpatialData } from "../common/data";
import { probePoints } from "../common/data";

function createViewer(): Viewer {
  let renderer: THREE.WebGLRenderer;
  let scn: THREE.Scene;
  let cam: THREE.PerspectiveCamera;
  let cfg: Cfg;
  let data: SpatialData;
  let pointsGeo: THREE.BufferGeometry | null = null;
  let pointsObj: THREE.Points | null = null;
  let inst: THREE.InstancedMesh | null = null;
  let segGeo: THREE.BufferGeometry | null = null;
  const vp = new THREE.Matrix4();
  let size = { width: 1, height: 1 };

  return {
    async init(canvas, c, d, s) {
      cfg = c; data = d; size = s;
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
      renderer.setPixelRatio(1);
      renderer.setSize(s.width, s.height, false);
      renderer.setClearColor(0x05070b, 1);
      scn = new THREE.Scene();
      cam = new THREE.PerspectiveCamera(50, s.width / s.height, 0.1, 500);
      cam.position.set(40, 14, 0);
      cam.lookAt(0, 0, 0);
      scn.add(new THREE.AmbientLight(0xffffff, 1.2));
      const dl = new THREE.DirectionalLight(0xffffff, 1.5);
      dl.position.set(10, 20, 8);
      scn.add(dl);
      const notes: string[] = [];

      if (c.points > 0) {
        pointsGeo = new THREE.BufferGeometry();
        pointsGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(d.pointPositions[0]!), 3).setUsage(THREE.DynamicDrawUsage));
        pointsGeo.setAttribute("color", new THREE.BufferAttribute(new Uint8Array(d.pointColors[0]!), 4, true).setUsage(THREE.DynamicDrawUsage));
        pointsGeo.computeBoundingSphere();
        pointsObj = new THREE.Points(pointsGeo, new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false, vertexColors: true }));
        pointsObj.frustumCulled = false;
        scn.add(pointsObj);
      }
      if (c.instances > 0) {
        inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xd8c25a, roughness: 0.6 }), c.instances);
        inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        inst.instanceMatrix.array.set(d.instanceMatrices[0]!);
        inst.frustumCulled = false;
        scn.add(inst);
      }
      if (c.segments > 0) {
        segGeo = new THREE.BufferGeometry();
        segGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(d.segmentPositions[0]!), 3).setUsage(THREE.DynamicDrawUsage));
        segGeo.computeBoundingSphere();
        const lines = new THREE.LineSegments(segGeo, new THREE.LineBasicMaterial({ color: 0x55ddff }));
        lines.frustumCulled = false;
        scn.add(lines);
      }
      renderer.render(scn, cam);
      return { library: "three.js", version: THREE.REVISION, notes, details: { colorFormat: "Uint8 normalized RGBA, no conversion", positions: "Float32Array xyz, written in place" } };
    },
    applyTick(slot) {
      if (pointsGeo) {
        const pos = pointsGeo.getAttribute("position") as THREE.BufferAttribute;
        (pos.array as Float32Array).set(data.pointPositions[slot]!);
        pos.needsUpdate = true;
        const col = pointsGeo.getAttribute("color") as THREE.BufferAttribute;
        (col.array as Uint8Array).set(data.pointColors[slot]!);
        col.needsUpdate = true;
      }
      if (inst) {
        const src = data.instanceMatrices[slot]!;
        if (cfg.variant === "loop") {
          const m = new THREE.Matrix4();
          for (let i = 0; i < cfg.instances; i++) { m.fromArray(src, i * 16); inst.setMatrixAt(i, m); }
        } else {
          (inst.instanceMatrix.array as Float32Array).set(src);
        }
        inst.instanceMatrix.needsUpdate = true;
      }
      if (segGeo) {
        const pos = segGeo.getAttribute("position") as THREE.BufferAttribute;
        (pos.array as Float32Array).set(data.segmentPositions[slot]!);
        pos.needsUpdate = true;
      }
      return 0;
    },
    setCamera(pose) {
      cam.position.set(...pose.position);
      cam.lookAt(...pose.target);
    },
    render() {
      renderer.render(scn, cam);
    },
    viewProjection() {
      cam.updateMatrixWorld();
      vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      return vp.elements;
    },
    pick(ndc, kind) {
      const rc = new THREE.Raycaster();
      rc.params.Points = { threshold: 0.25 };
      cam.updateMatrixWorld();
      let hits = 0;
      const target = kind === "points" ? pointsObj : inst;
      if (!target) return { hits: 0, status: "no target", usable: false };
      void probePoints; void size;
      for (const [x, y] of ndc) {
        rc.setFromCamera(new THREE.Vector2(x, y), cam);
        hits += rc.intersectObject(target, false).length;
      }
      return { hits, status: kind === "points" ? "Raycaster + Points (threshold 0.25, brute force)" : "Raycaster + InstancedMesh (per-instance triangle test)", usable: true };
    }
  };
}

void runBench(createViewer, "three");
