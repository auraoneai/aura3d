import { composeMat4 } from "@aura3d/scene";
import {
  Geometry,
  Renderer,
  UnlitMaterial,
  WebGPUParticleBackend,
  queryGPUParticleBackendCapabilities
} from "@aura3d/rendering";
import { rotationZQuat, simpleBounds } from "/apps/wow-common/src/simple-showcase.ts";
import { startWebGPUShowcase } from "/apps/wow-common/src/webgpu-showcase.ts";

const particleCount = 2048;
const pointMaterial = new UnlitMaterial({
  name: "webgpu-compute-particles",
  color: [0.34, 0.95, 1, 1],
  pointSize: 15,
  roundPoints: true
});

void startWebGPUShowcase({
  appId: "wow-webgpu-compute-particles",
  title: "Aura3D Accelerated Particle Field",
  subtitle: "Aura3D uses native WebGPU compute when available and automatically keeps the particle field live through its WebGL2 compatibility path.",
  labels: {
    concept: "portable particle simulation",
    workload: `${particleCount} accelerated particles`,
    api: "WebGPUParticleBackend + Aura3D Renderer"
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
      antialias: true
    });
    const computeBackend = useNativeCompute ? new WebGPUParticleBackend() : undefined;
    await computeBackend?.initialize();

    let positions = createInitialPositions();
    let velocities = createInitialVelocities();
    const accelerations = createAccelerations();
    let dispatchCount = 0;
    let workgroups = 0;

    return {
      requestedBackend: "auto",
      selectedBackend,
      adapterName: capabilities.adapterName ?? renderer.device.info.renderer,
      capabilities: [
        useNativeCompute ? "webgpu-compute" : "webgl2-particle-compatibility",
        ...(renderer.device.info.capabilities ?? [])
      ],
      resize: (width, height) => renderer.resize(width, height),
      dispose: () => {
        computeBackend?.dispose();
        renderer.dispose();
      },
      async render(timeSeconds) {
        let simulationBackend = "Aura3D WebGL2 compatibility";
        if (computeBackend) {
          const result = await computeBackend.update({
            positions,
            velocities,
            accelerations,
            deltaTime: 1 / 60,
            count: particleCount
          });
          positions = wrapPositions(result.positions);
          velocities = result.velocities;
          workgroups = result.workgroups;
          simulationBackend = result.backend;
        } else {
          updateCpuParticles(positions, velocities, accelerations, 1 / 60);
          positions = wrapPositions(positions);
          workgroups = Math.ceil(particleCount / 64);
        }
        dispatchCount += 1;

        const diagnostics = await renderer.renderAsync({
          renderItems: [{
            label: "webgpu-compute-particles",
            geometry: Geometry.points(toPointPositions(positions)),
            material: pointMaterial,
            modelMatrix: composeMat4([0, 0, 0], rotationZQuat(timeSeconds * 0.08), [1, 1, 1])
          }],
          cameraPolicy: "auto-frame",
          cameraFrameBounds: simpleBounds(1.55),
          cameraFrameOptions: { paddingRatio: 0.08, yawRadians: 0, pitchRadians: 0 },
          environmentLighting: false,
          shadow: false,
          postprocess: false
        });

        return {
          diagnostics,
          readbackMode: useNativeCompute ? "compute storage readback" : "direct compatibility buffer",
          fields: {
            "Simulation steps": dispatchCount,
            Workgroups: workgroups,
            Particles: particleCount,
            "Particle backend": simulationBackend
          }
        };
      }
    };
  }
});

function updateCpuParticles(
  positions: Float32Array,
  velocities: Float32Array,
  accelerations: Float32Array,
  deltaTime: number
): void {
  for (let index = 0; index < particleCount; index += 1) {
    const offset = index * 4;
    velocities[offset] = (velocities[offset] ?? 0) + (accelerations[offset] ?? 0) * deltaTime;
    velocities[offset + 1] = (velocities[offset + 1] ?? 0) + (accelerations[offset + 1] ?? 0) * deltaTime;
    velocities[offset + 2] = (velocities[offset + 2] ?? 0) + (accelerations[offset + 2] ?? 0) * deltaTime;
    positions[offset] = (positions[offset] ?? 0) + (velocities[offset] ?? 0) * deltaTime;
    positions[offset + 1] = (positions[offset + 1] ?? 0) + (velocities[offset + 1] ?? 0) * deltaTime;
    positions[offset + 2] = (positions[offset + 2] ?? 0) + (velocities[offset + 2] ?? 0) * deltaTime;
  }
}

function createInitialPositions(): Float32Array {
  const values = new Float32Array(particleCount * 4);
  for (let index = 0; index < particleCount; index += 1) {
    const angle = index * 2.399963229728653;
    const strand = index % 4;
    const radius = 0.08 + 1.04 * Math.sqrt(index / particleCount);
    const wobble = Math.sin(index * 0.137) * 0.09;
    values[index * 4] = Math.cos(angle + strand * 0.23) * (radius + wobble);
    values[index * 4 + 1] = Math.sin(angle - strand * 0.18) * radius;
    values[index * 4 + 2] = Math.sin(index * 0.31) * 0.18;
    values[index * 4 + 3] = 0;
  }
  return values;
}

function createInitialVelocities(): Float32Array {
  const values = new Float32Array(particleCount * 4);
  for (let index = 0; index < particleCount; index += 1) {
    const angle = index * 2.399963229728653 + Math.PI / 2;
    const speed = 0.14 + (index % 29) * 0.0025;
    values[index * 4] = Math.cos(angle) * speed;
    values[index * 4 + 1] = Math.sin(angle) * speed;
  }
  return values;
}

function createAccelerations(): Float32Array {
  const values = new Float32Array(particleCount * 4);
  for (let index = 0; index < particleCount; index += 1) {
    const angle = index * 2.399963229728653 + Math.PI;
    values[index * 4] = Math.cos(angle) * 0.018;
    values[index * 4 + 1] = Math.sin(angle) * 0.018;
  }
  return values;
}

function wrapPositions(values: Float32Array): Float32Array {
  for (let index = 0; index < particleCount; index += 1) {
    const x = index * 4;
    const radius = Math.hypot(values[x] ?? 0, values[x + 1] ?? 0);
    if (radius > 1.16) {
      values[x] *= -0.64;
      values[x + 1] *= -0.64;
    }
  }
  return values;
}

function toPointPositions(values: Float32Array): [number, number, number][] {
  const points: [number, number, number][] = [];
  for (let index = 0; index < particleCount; index += 1) {
    points.push([
      values[index * 4] ?? 0,
      values[index * 4 + 1] ?? 0,
      values[index * 4 + 2] ?? 0
    ]);
  }
  return points;
}
