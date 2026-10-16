import { SceneNode } from "@aura3d/scene";
import { Geometry, PBRMaterial, createLightingDefault, type RenderItem } from "@aura3d/rendering";
import {
  rotationXQuat,
  rotationYQuat,
  rotationZQuat,
  simpleBounds,
  startSimpleGraphicsShowcase
} from "/apps/wow-common/src/simple-showcase.ts";

function multiplyQuat(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number]
): [number, number, number, number] {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

const cube = Geometry.litCube(0.68);
const coreSphere = Geometry.uvSphere(0.46, 48, 24);
const satelliteSphere = Geometry.uvSphere(0.22, 40, 20);
const moonCube = Geometry.litCube(0.16);
const outerRing = Geometry.torus({ radius: 1.24, tube: 0.042, radialSegments: 72, tubularSegments: 24, textured: false });
const innerRing = Geometry.torus({ radius: 0.92, tube: 0.03, radialSegments: 64, tubularSegments: 20, textured: false });
const plinth = Geometry.cylinder({ radiusTop: 1.35, radiusBottom: 1.48, height: 0.14, segments: 64 });

const lighting = createLightingDefault("studioProduct");

const goldCoreMaterial = new PBRMaterial({
  name: "transform-core-gold",
  baseColor: [0.96, 0.74, 0.24, 1],
  metallic: 0.88,
  roughness: 0.2
});
const innerCoreMaterial = new PBRMaterial({
  name: "transform-core-amber",
  baseColor: [0.98, 0.48, 0.14, 1],
  metallic: 0.35,
  roughness: 0.28
});
const ringFrameMaterial = new PBRMaterial({
  name: "transform-orbital-ring",
  baseColor: [0.76, 0.84, 0.96, 1],
  metallic: 0.82,
  roughness: 0.24
});
const satelliteMaterials = [
  new PBRMaterial({
    name: "transform-satellite-cobalt",
    baseColor: [0.18, 0.56, 0.98, 1],
    metallic: 0.24,
    roughness: 0.28
  }),
  new PBRMaterial({
    name: "transform-satellite-emerald",
    baseColor: [0.14, 0.86, 0.68, 1],
    metallic: 0.28,
    roughness: 0.26
  }),
  new PBRMaterial({
    name: "transform-satellite-crimson",
    baseColor: [0.96, 0.34, 0.42, 1],
    metallic: 0.22,
    roughness: 0.3
  })
] as const;
const plinthMaterial = new PBRMaterial({
  name: "transform-sculpture-plinth",
  baseColor: [0.07, 0.09, 0.14, 1],
  metallic: 0.42,
  roughness: 0.52
});

const sculptureRoot = new SceneNode({ name: "sculpture-root" });
const plinthNode = new SceneNode({ name: "transform-plinth" });
const corePivotNode = new SceneNode({ name: "transform-core-pivot" });
const coreCubeNode = new SceneNode({ name: "transform-cube" });
const coreSphereNode = new SceneNode({ name: "transform-sphere" });
const outerRingNode = new SceneNode({ name: "transform-outer-ring" });
const innerRingNode = new SceneNode({ name: "transform-inner-ring" });

sculptureRoot.addChild(plinthNode);
sculptureRoot.addChild(corePivotNode);
sculptureRoot.addChild(outerRingNode);
outerRingNode.addChild(innerRingNode);
corePivotNode.addChild(coreCubeNode);
corePivotNode.addChild(coreSphereNode);

const satelliteNodes = satelliteMaterials.map((material, index) => {
  const carrier = new SceneNode({ name: `transform-satellite-carrier-${index}` });
  const satellite = new SceneNode({ name: `transform-satellite-${index}` });
  const moonlet = new SceneNode({ name: `transform-moonlet-${index}` });
  outerRingNode.addChild(carrier);
  carrier.addChild(satellite);
  satellite.addChild(moonlet);
  return { carrier, satellite, moonlet, material, index };
});

plinthNode.transform.setPosition(0, -1.12, 0);

const postProcess = {
  tonemapping: { enabled: true, mode: "aces" as const, exposure: 1.18 },
  bloom: { enabled: true, intensity: 0.22, threshold: 0.78 },
  ssao: { enabled: true, radius: 2, intensity: 0.32 },
  fxaa: { enabled: true },
  vignette: { enabled: true, intensity: 0.2 }
};

void startSimpleGraphicsShowcase({
  appId: "wow-simple-transforms",
  title: "Aura3D 4.0 · Hierarchical Transform Sculpture",
  subtitle: "Multi-node 3D scene-graph sculpture with a rotating metallic-gold core, tilted orbital ring frames, and 3 parented satellite spheres.",
  clearColor: [0.04, 0.06, 0.1, 1],
  labels: {
    concept: "SceneNode hierarchy",
    primitive: "core + orbital rings + 3 satellites",
    api: "SceneNode + composeMat4 + Renderer"
  },
  lightingRig: {
    keyIntensity: 2.45,
    fillIntensity: 1.15,
    rimIntensity: 1.35
  },
  postProcess,
  createFrame: (timeSeconds) => {
    const coreBob = Math.sin(timeSeconds * 1.4) * 0.06;
    corePivotNode.transform.setPosition(0, coreBob, 0);
    const coreSpin = multiplyQuat(rotationYQuat(timeSeconds * 0.85), rotationZQuat(timeSeconds * 0.42));
    corePivotNode.transform.setRotation(coreSpin[0], coreSpin[1], coreSpin[2], coreSpin[3]);

    coreCubeNode.transform.setScale(0.92, 0.92, 0.92);
    const innerCounterSpin = rotationYQuat(-timeSeconds * 1.35);
    coreSphereNode.transform.setRotation(
      innerCounterSpin[0],
      innerCounterSpin[1],
      innerCounterSpin[2],
      innerCounterSpin[3]
    );
    const pulse = 0.78 + Math.sin(timeSeconds * 2.2) * 0.05;
    coreSphereNode.transform.setScale(pulse, pulse, pulse);

    const outerTilt = multiplyQuat(
      rotationYQuat(timeSeconds * 0.48),
      multiplyQuat(rotationXQuat(0.58), rotationZQuat(0.28))
    );
    outerRingNode.transform.setPosition(0, coreBob * 0.5, 0);
    outerRingNode.transform.setRotation(outerTilt[0], outerTilt[1], outerTilt[2], outerTilt[3]);

    const innerTilt = multiplyQuat(rotationXQuat(-0.82), rotationYQuat(-timeSeconds * 0.76));
    innerRingNode.transform.setRotation(innerTilt[0], innerTilt[1], innerTilt[2], innerTilt[3]);

    for (const { carrier, satellite, moonlet, index } of satelliteNodes) {
      const orbitAngle = timeSeconds * 0.95 + (index * Math.PI * 2) / satelliteNodes.length;
      const carrierRot = rotationZQuat(orbitAngle);
      carrier.transform.setRotation(carrierRot[0], carrierRot[1], carrierRot[2], carrierRot[3]);

      const verticalOffset = Math.sin(timeSeconds * 1.8 + index * 2.1) * 0.08;
      satellite.transform.setPosition(1.24, 0, verticalOffset);
      const satSpin = rotationYQuat(timeSeconds * 1.6 + index);
      satellite.transform.setRotation(satSpin[0], satSpin[1], satSpin[2], satSpin[3]);

      const moonOrbit = timeSeconds * 2.4 + index * 1.7;
      moonlet.transform.setPosition(Math.cos(moonOrbit) * 0.34, Math.sin(moonOrbit) * 0.34, 0);
      const moonSpin = multiplyQuat(rotationXQuat(moonOrbit), rotationYQuat(moonOrbit * 0.7));
      moonlet.transform.setRotation(moonSpin[0], moonSpin[1], moonSpin[2], moonSpin[3]);
    }

    sculptureRoot.updateWorldTransform(true);

    const renderItems: RenderItem[] = [
      {
        label: "transform-plinth",
        geometry: plinth,
        material: plinthMaterial,
        modelMatrix: plinthNode.transform.worldMatrix
      },
      {
        label: "transform-cube",
        geometry: cube,
        material: goldCoreMaterial,
        modelMatrix: coreCubeNode.transform.worldMatrix
      },
      {
        label: "transform-sphere",
        geometry: coreSphere,
        material: innerCoreMaterial,
        modelMatrix: coreSphereNode.transform.worldMatrix
      },
      {
        label: "transform-outer-ring",
        geometry: outerRing,
        material: ringFrameMaterial,
        modelMatrix: outerRingNode.transform.worldMatrix
      },
      {
        label: "transform-inner-ring",
        geometry: innerRing,
        material: goldCoreMaterial,
        modelMatrix: innerRingNode.transform.worldMatrix
      },
      ...satelliteNodes.flatMap(({ satellite, moonlet, material, index }) => [
        {
          label: `transform-satellite-${index}`,
          geometry: satelliteSphere,
          material,
          modelMatrix: satellite.transform.worldMatrix
        },
        {
          label: `transform-moonlet-${index}`,
          geometry: moonCube,
          material: ringFrameMaterial,
          modelMatrix: moonlet.transform.worldMatrix
        }
      ])
    ];

    return {
      renderItems,
      bounds: simpleBounds(1.65),
      cameraFrameOptions: { paddingRatio: 0.08, yawRadians: -0.34, pitchRadians: -0.18 },
      environmentLighting: lighting.environmentLighting,
      postProcess
    };
  }
});
