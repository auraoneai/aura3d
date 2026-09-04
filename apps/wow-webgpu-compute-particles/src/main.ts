import { composeMat4 } from "@aura3d/scene";
import {
  CollisionModule,
  ColorModule,
  HeightfieldModule,
  LightingModule,
  ParticleEmitter,
  ParticleRenderer,
  ParticleSystem,
  SizeModule,
  SubEmitterModule,
  TrailModule,
  TurbulenceModule,
  WebGPUParticleBackend,
  WindModule,
  createLayeredParticleBudgetPlan,
  createSineHeightfield,
  queryGPUParticleBackendCapabilities,
  Geometry,
  Renderer,
  UnlitMaterial,
} from "@aura3d/rendering";
import { rotationZQuat, simpleBounds } from "/apps/wow-common/src/simple-showcase.ts";
import { startWebGPUShowcase } from "/apps/wow-common/src/webgpu-showcase.ts";

/**
 * PART A4 demo: 10k GPU particles with sub-emitters, curl-noise turbulence,
 * heightfield ground + analytic walls, GPU ribbon trails, size/color-over-life
 * curves, velocity-normal lighting, and planar soft-particle depth fade.
 * WebGPU compute when available, same module stack on the CPU fallback.
 */
const particleCount = 10_000;
const trailLifetime = 0.45;
const fadeDistance = 0.45;
const cameraAnchor = { x: 0, y: 1.5, z: 3.2 };

const tierMaterials = {
  young: new UnlitMaterial({ name: "a4-particles-young", color: [1, 0.8, 0.35, 1], pointSize: 9, roundPoints: true }),
  mid: new UnlitMaterial({ name: "a4-particles-mid", color: [1, 0.45, 0.15, 1], pointSize: 12, roundPoints: true }),
  old: new UnlitMaterial({ name: "a4-particles-old", color: [0.5, 0.3, 0.35, 1], pointSize: 8, roundPoints: true }),
  trail: new UnlitMaterial({ name: "a4-particles-trail", color: [0.55, 0.42, 0.3, 0.8], pointSize: 4, roundPoints: true }),
};

const budgetPlan = createLayeredParticleBudgetPlan({
  requestedParticles: particleCount,
  minParticles: 4_000,
  maxParticles: particleCount,
  layers: [
    { name: "fountain", weight: 0.82 },
    { name: "sparks", weight: 0.18 },
  ],
  densityTiers: [
    { threshold: 10_000, label: "10k showcase", mode: "showcase" },
    { threshold: 4_000, label: "4k interactive", mode: "interactive" },
  ],
});

function createParticleSystem(): ParticleSystem {
  return new ParticleSystem({
    maxParticles: particleCount,
    emitters: [
      new ParticleEmitter({
        seed: 20260904,
        emissionRate: 4500,
        lifetime: { min: 1.4, max: 2.2 },
        speed: { min: 1.6, max: 2.6 },
        shape: { type: "cone", origin: { x: 0, y: 0.4, z: 0 }, radius: 0.3, length: 0.3, angle: Math.PI / 7, emitFromVolume: true },
        initial: {
          size: 0.05,
          acceleration: { x: 0, y: -3.2, z: 0 },
          color: { r: 1, g: 0.75, b: 0.3, a: 1 },
        },
      }),
    ],
    modules: [
      new WindModule({
        direction: { x: 0.9, y: 0, z: 0.3 },
        strength: 0.5,
        gustAmplitude: 0.6,
        gustDirection: { x: 1, y: 0, z: 0.2 },
        gustFrequency: 0.5,
        gustSpeed: 0.8,
      }),
      new TurbulenceModule({ strength: 0.9, scale: 0.7, flowSpeed: 0.15 }),
      new HeightfieldModule({
        sampler: createSineHeightfield(24, 24, 0.25, 0.22, 1.2, -3, -3),
        restitution: 0.35,
      }),
      // Safe side is dot(normal, p) + constant >= 0: walls keep |x| <= 2.6,
      // and the kill floor only fires below y = -3.
      new CollisionModule({ normal: { x: -1, y: 0, z: 0 }, constant: 2.6, restitution: 0.4 }),
      new CollisionModule({ normal: { x: 1, y: 0, z: 0 }, constant: 2.6, restitution: 0.4 }),
      new CollisionModule({ normal: { x: 0, y: 1, z: 0 }, constant: 3, restitution: 0, mode: "kill" }),
      new ColorModule([
        { time: 0, color: { r: 1, g: 0.75, b: 0.3, a: 1 } },
        { time: 0.5, color: { r: 1, g: 0.35, b: 0.1, a: 0.85 } },
        { time: 1, color: { r: 0.25, g: 0.22, b: 0.28, a: 0 } },
      ]),
      new SizeModule([
        { time: 0, size: 0.03 },
        { time: 0.35, size: 0.07 },
        { time: 1, size: 0.015 },
      ]),
      new LightingModule({
        ambient: [0.45, 0.45, 0.5],
        keyDirection: { x: 0.3, y: 1, z: 0.2 },
        diffuseStrength: 0.9,
      }),
      new SubEmitterModule({
        trigger: "death",
        chance: 0.2,
        childrenPerEvent: 2,
        velocityInherit: 0.4,
        childEmitter: new ParticleEmitter({
          seed: 77,
          emissionRate: 0,
          lifetime: { min: 0.4, max: 0.9 },
          speed: { min: 0.8, max: 1.8 },
          shape: { type: "sphere", center: { x: 0, y: 0, z: 0 }, radius: 0.05 },
          initial: { size: 0.03, color: { r: 1, g: 0.6, b: 0.2, a: 1 } },
        }),
      }),
      new TrailModule({ maxPoints: 6, minDistance: 0.02, lifetime: trailLifetime }),
    ],
  });
}

/** Planar soft-particle fade against the y=0 ground along the view ray. */
function groundSceneDepth(x: number, y: number, z: number): number {
  const dx = x - cameraAnchor.x;
  const dy = y - cameraAnchor.y;
  const dz = z - cameraAnchor.z;
  const distance = Math.hypot(dx, dy, dz);
  if (dy >= -1e-4) {
    return Number.POSITIVE_INFINITY;
  }
  const t = cameraAnchor.y / -dy;
  return t * distance;
}

function particleViewDepth(x: number, y: number, z: number): number {
  return Math.hypot(x - cameraAnchor.x, y - cameraAnchor.y, z - cameraAnchor.z);
}

void startWebGPUShowcase({
  appId: "wow-webgpu-compute-particles",
  title: "Aura3D Accelerated Particle Field",
  subtitle: "10k GPU particles: sub-emitters, curl turbulence, heightfield collision, ribbon trails, life curves, lighting, soft depth fade.",
  labels: {
    concept: "gpu particle behavior",
    workload: `${particleCount} accelerated particles`,
    api: "WebGPUParticleBackend + ParticleSystem A4 effects",
  },
  async setup({ canvas, renderSize }) {
    const capabilities = await queryGPUParticleBackendCapabilities();
    const useNativeCompute = capabilities.supported;
    const selectedBackend = useNativeCompute ? "webgpu" : "webgl2";
    const renderer = await Renderer.create({
      backend: selectedBackend,
      canvas,
      width: renderSize.width,
      height: renderSize.height,
      clearColor: [0.01, 0.014, 0.022, 1],
      antialias: true,
    });
    const computeBackend = useNativeCompute ? new WebGPUParticleBackend() : undefined;
    await computeBackend?.initialize();

    const system = createParticleSystem();
    const batchRenderer = new ParticleRenderer();
    let steps = 0;
    let workgroups = 0;
    let lastBackend: string = useNativeCompute ? "webgpu" : "cpu-fallback";

    return {
      requestedBackend: "auto",
      selectedBackend,
      adapterName: capabilities.adapterName ?? renderer.device.info.renderer,
      capabilities: [
        useNativeCompute ? "webgpu-compute" : "webgl2-particle-compatibility",
        "a4-sub-emitters",
        "a4-curl-turbulence",
        "a4-heightfield-collision",
        "a4-ribbon-trails",
        "a4-life-curves",
        "a4-particle-lighting",
        "a4-soft-particles",
        ...(renderer.device.info.capabilities ?? []),
      ],
      resize: (width, height) => renderer.resize(width, height),
      dispose: () => {
        computeBackend?.dispose();
        renderer.dispose();
      },
      async render(timeSeconds) {
        if (computeBackend) {
          lastBackend = "webgpu";
          await system.updateOnGPU(1 / 60, computeBackend);
          workgroups = Math.ceil(Math.max(1, system.getStats().liveCount) / 64);
        } else {
          lastBackend = "cpu-fallback";
          system.update(1 / 60);
          workgroups = Math.ceil(Math.max(1, system.getStats().liveCount) / 64);
        }
        steps += 1;

        const batch = batchRenderer.buildBatch(system.particles, {
          softParticles: {
            enabled: true,
            fadeDistance,
            sceneDepthAt: (position) => groundSceneDepth(position.x, position.y, position.z),
            particleDepthAt: (position) => particleViewDepth(position.x, position.y, position.z),
          },
        });
        system.recordBufferUpload(batch.uploadedBytes);

        const young: [number, number, number][] = [];
        const mid: [number, number, number][] = [];
        const old: [number, number, number][] = [];
        const trailPoints: [number, number, number][] = [];
        for (const particle of system.particles) {
          if (!particle.alive) continue;
          const target =
            particle.age < particle.lifetime * 0.33 ? young : particle.age < particle.lifetime * 0.66 ? mid : old;
          target.push([particle.position.x, particle.position.y, particle.position.z]);
        }
        for (let index = 0; index < system.particles.length; index += 4) {
          const trail = system.particles[index]?.userData.trail as { position: { x: number; y: number; z: number } }[] | undefined;
          if (!Array.isArray(trail)) continue;
          for (const point of trail) {
            trailPoints.push([point.position.x, point.position.y, point.position.z]);
          }
        }

        const renderItems = [];
        if (young.length > 0) {
          renderItems.push({
            label: "a4-particles-young",
            geometry: Geometry.points(young),
            material: tierMaterials.young,
            modelMatrix: composeMat4([0, 0, 0], rotationZQuat(timeSeconds * 0.02), [1, 1, 1]),
          });
        }
        if (mid.length > 0) {
          renderItems.push({
            label: "a4-particles-mid",
            geometry: Geometry.points(mid),
            material: tierMaterials.mid,
            modelMatrix: composeMat4([0, 0, 0], rotationZQuat(timeSeconds * 0.02), [1, 1, 1]),
          });
        }
        if (old.length > 0) {
          renderItems.push({
            label: "a4-particles-old",
            geometry: Geometry.points(old),
            material: tierMaterials.old,
            modelMatrix: composeMat4([0, 0, 0], rotationZQuat(timeSeconds * 0.02), [1, 1, 1]),
          });
        }
        if (trailPoints.length > 0) {
          renderItems.push({
            label: "a4-particle-trails",
            geometry: Geometry.points(trailPoints),
            material: tierMaterials.trail,
            modelMatrix: composeMat4([0, 0, 0], rotationZQuat(timeSeconds * 0.02), [1, 1, 1]),
          });
        }

        const diagnostics = await renderer.renderAsync({
          renderItems,
          cameraPolicy: "auto-frame",
          cameraFrameBounds: simpleBounds(2.8),
          cameraFrameOptions: { paddingRatio: 0.08, yawRadians: 0, pitchRadians: 0 },
          environmentLighting: false,
          shadow: false,
          postprocess: false,
        });
        const stats = system.getStats();

        return {
          diagnostics,
          readbackMode: useNativeCompute ? "compute storage readback" : "direct compatibility buffer",
          fields: {
            "Simulation steps": steps,
            Workgroups: workgroups,
            Particles: particleCount,
            Live: stats.liveCount,
            Spawned: stats.spawnedCount,
            "Particle backend": lastBackend,
            "Sub-emitters": "death sparks (chance 0.2)",
            Turbulence: "curl-noise LUT 8^3",
            Collision: "heightfield + 2 walls + kill floor",
            Trails: `ring depth 6, lifetime ${trailLifetime}`,
            "Life curves": "size + color/alpha LUT 16",
            Lighting: "velocity normal + ambient",
            "Soft fade": `planar ground, distance ${fadeDistance}`,
            overBudget: stats.overBudget,
            Dropped: stats.droppedCount,
            "Budget plan over": budgetPlan.overBudget,
          },
        };
      },
    };
  },
});
