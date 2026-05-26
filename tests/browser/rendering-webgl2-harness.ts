import {
  DEFAULT_TEXTURED_UNLIT_SHADER_NAME,
  Geometry,
  IndexBuffer,
  InstancedPBRMaterial,
  InstancedUnlitMaterial,
  Material,
  MorphUnlitMaterial,
  NormalMappedPBRMaterial,
  PBRMaterial,
  Renderer,
  Sampler,
  ShadowPass,
  Texture,
  TextureBinding,
  TexturedPBRMaterial,
  TexturedUnlitMaterial,
  UnlitMaterial,
  VertexBuffer,
  VertexFormat,
  createRenderDevice,
  type RenderDeviceDiagnostics
} from "@aura3d/rendering";
import { DirectionalLight, PointLight, Renderable, Scene, SpotLight } from "@aura3d/scene";

declare global {
  interface Window {
    __AURA3D_RENDERING_TEST__?: RenderingHarnessResult;
  }
}

export interface RenderingHarnessResult {
  readonly status: "ready" | "error";
  readonly diagnostics?: RenderDeviceDiagnostics;
  readonly lineDiagnostics?: RenderDeviceDiagnostics;
  readonly pointDiagnostics?: RenderDeviceDiagnostics;
  readonly cubeDiagnostics?: RenderDeviceDiagnostics;
  readonly pbrDiagnostics?: RenderDeviceDiagnostics;
  readonly pbrSphereDiagnostics?: RenderDeviceDiagnostics;
  readonly litCubeDiagnostics?: RenderDeviceDiagnostics;
  readonly texturedCubeDiagnostics?: RenderDeviceDiagnostics;
  readonly texturedPbrNoTangentDiagnostics?: RenderDeviceDiagnostics;
  readonly textureFallbackDiagnostics?: RenderDeviceDiagnostics;
  readonly normalMapDiagnostics?: RenderDeviceDiagnostics;
  readonly morphSceneDiagnostics?: RenderDeviceDiagnostics;
  readonly gpuMorphSceneDiagnostics?: RenderDeviceDiagnostics;
  readonly instancedDiagnostics?: RenderDeviceDiagnostics;
  readonly instancedPbrDiagnostics?: RenderDeviceDiagnostics;
  readonly emissiveDiagnostics?: RenderDeviceDiagnostics;
  readonly environmentDiagnostics?: RenderDeviceDiagnostics;
  readonly localLightDiagnostics?: RenderDeviceDiagnostics;
  readonly outOfRangeDiagnostics?: RenderDeviceDiagnostics;
  readonly centerPixel?: readonly number[];
  readonly linePixel?: readonly number[];
  readonly pointPixel?: readonly number[];
  readonly cubePixel?: readonly number[];
  readonly pbrCenterPixel?: readonly number[];
  readonly pbrSphereCenterPixel?: readonly number[];
  readonly pbrSphereRimPixel?: readonly number[];
  readonly litCubePixel?: readonly number[];
  readonly texturedCubePixel?: readonly number[];
  readonly texturedPbrNoTangentPixel?: readonly number[];
  readonly textureFallbackPixel?: readonly number[];
  readonly normalMapPixel?: readonly number[];
  readonly morphScenePixel?: readonly number[];
  readonly gpuMorphScenePixel?: readonly number[];
  readonly instancedLeftPixel?: readonly number[];
  readonly instancedRightPixel?: readonly number[];
  readonly instancedPbrLeftPixel?: readonly number[];
  readonly instancedPbrRightPixel?: readonly number[];
  readonly emissivePixel?: readonly number[];
  readonly environmentPixel?: readonly number[];
  readonly localLightPixel?: readonly number[];
  readonly outOfRangePixel?: readonly number[];
  readonly shadowMapDiagnostics?: RenderDeviceDiagnostics;
  readonly shadowedReceiverPixel?: readonly number[];
  readonly litReceiverPixel?: readonly number[];
  readonly canvasFrame?: { readonly width: number; readonly height: number };
  readonly bufferReadback?: readonly number[];
  readonly renderTargetReadback?: readonly number[];
  readonly hdrRenderTargetReadback?: readonly number[] | null;
  readonly hdrRenderTargetFormat?: string | null;
  readonly postprocessDepthPixel?: readonly number[];
  readonly renderTargetViewport?: { readonly width: number; readonly height: number; readonly target: string | null };
  readonly backbufferViewportAfterTarget?: { readonly width: number; readonly height: number; readonly target: string | null };
  readonly renderTargetDiagnostics?: RenderDeviceDiagnostics;
  readonly renderTargetAfterDispose?: RenderDeviceDiagnostics;
  readonly contextLoss?: {
    readonly supported: boolean;
    readonly contextLost: boolean;
    readonly lastError: string | null;
    readonly thrownCode?: string;
  };
  readonly error?: string;
}

async function run(): Promise<void> {
  try {
    const renderCanvas = requireCanvas("render");
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas: renderCanvas,
      width: renderCanvas.width,
      height: renderCanvas.height,
      clearColor: [0, 0, 0, 1]
    });

    const diagnostics = renderer.render([
      {
        geometry: Geometry.triangle(),
        material: new UnlitMaterial({ color: [1, 0.12, 0.04, 1] }),
        label: "browser-triangle"
      }
    ]);
    const centerPixel = readPixel(renderCanvas, 32, 32);
    renderer.dispose();

    const lineCanvas = requireCanvas("lines");
    const lineRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: lineCanvas,
      width: lineCanvas.width,
      height: lineCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const lineDiagnostics = lineRenderer.render([
      {
        geometry: Geometry.lineSegments([
          [-0.85, -0.65, 0],
          [0.85, 0.65, 0],
          [-0.85, 0.65, 0],
          [0.85, -0.65, 0]
        ]),
        material: new UnlitMaterial({
          color: [1, 0.18, 0.02, 1],
          renderState: { depthTest: false, depthWrite: false, cullMode: "none" }
        }),
        label: "browser-line-segments"
      }
    ]);
    const linePixel = findPixel(lineCanvas, { x: 40, y: 40, width: 16, height: 16 }, (r, g, b, a) => r > 180 && g > 15 && g < 90 && b < 40 && a === 255);
    lineRenderer.dispose();

    const pointCanvas = requireCanvas("points");
    const pointRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: pointCanvas,
      width: pointCanvas.width,
      height: pointCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const pointDiagnostics = pointRenderer.render([
      {
        geometry: Geometry.points([
          [-0.45, -0.2, 0],
          [0, 0.35, 0],
          [0.45, -0.2, 0]
        ]),
        material: new UnlitMaterial({
          color: [0.02, 0.85, 1, 1],
          renderState: { depthTest: false, depthWrite: false, cullMode: "none" }
        }),
        label: "browser-point-cloud"
      }
    ]);
    const pointPixel = findPixel(pointCanvas, { x: 42, y: 60, width: 12, height: 12 }, (r, g, b, a) => r < 50 && g > 150 && b > 180 && a === 255);
    pointRenderer.dispose();

    const unlitCubeCanvas = requireCanvas("cube");
    const unlitCubeRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: unlitCubeCanvas,
      width: unlitCubeCanvas.width,
      height: unlitCubeCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const cubeDiagnostics = unlitCubeRenderer.render([
      {
        geometry: Geometry.cube(1.2),
        material: new UnlitMaterial({ color: [0.1, 0.48, 1, 1] }),
        label: "browser-unlit-cube"
      }
    ]);
    const cubePixel = readPixel(unlitCubeCanvas, 32, 32);
    unlitCubeRenderer.dispose();


    const pbrCanvas = requireCanvas("pbr");
    const pbrRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: pbrCanvas,
      width: pbrCanvas.width,
      height: pbrCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const scene = new Scene();
    const sun = scene.createLight("directional", "browser-key-light");
    sun.intensity = 0.32;
    sun.color = [1, 1, 1];
    scene.root.addChild(sun);
    const pbrDiagnostics = pbrRenderer.render({
      scene,
      renderItems: [
        {
          geometry: Geometry.litTriangle(),
          material: new PBRMaterial({ baseColor: [0.8, 0.45, 0.16, 1], roughness: 0.75 }),
          label: "browser-pbr-lit-triangle"
        }
      ]
    });
    const pbrCenterPixel = readPixel(pbrCanvas, 32, 32);
    pbrRenderer.dispose();

    const sphereCanvas = requireCanvas("pbr-sphere");
    const sphereRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: sphereCanvas,
      width: sphereCanvas.width,
      height: sphereCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const sphereScene = new Scene();
    const sphereSun = sphereScene.createLight("directional", "browser-sphere-key");
    sphereSun.intensity = 1.05;
    sphereSun.color = [1, 0.92, 0.82];
    sphereSun.transform.setRotation(0, 1, 0, 0);
    sphereScene.root.addChild(sphereSun);
    const pbrSphereDiagnostics = sphereRenderer.render({
      scene: sphereScene,
      renderItems: [
        {
          geometry: Geometry.uvSphere(0.72, 32, 16),
          material: new PBRMaterial({ baseColor: [0.78, 0.62, 0.34, 1], roughness: 0.35 }),
          label: "browser-pbr-lit-sphere"
        }
      ]
    });
    const pbrSphereCenterPixel = findPixel(sphereCanvas, { x: 18, y: 18, width: 60, height: 60 }, (r, g, b) => r > 90 && g > 55 && b > 20);
    const pbrSphereRimPixel = readPixel(sphereCanvas, 6, 6);
    sphereRenderer.dispose();

    const cubeCanvas = requireCanvas("lit-cube");
    const cubeRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: cubeCanvas,
      width: cubeCanvas.width,
      height: cubeCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const cubeScene = new Scene();
    const cubeSun = cubeScene.createLight("directional", "browser-cube-key");
    cubeSun.intensity = 1.15;
    cubeSun.color = [0.8, 0.95, 1];
    cubeSun.transform.setRotation(0, 1, 0, 0);
    cubeScene.root.addChild(cubeSun);
    const litCubeDiagnostics = cubeRenderer.render({
      scene: cubeScene,
      renderItems: [
        {
          geometry: Geometry.litCube(1.15),
          material: new PBRMaterial({ baseColor: [0.38, 0.72, 0.95, 1], roughness: 0.55, renderState: { cullMode: "none" } }),
          label: "browser-lit-cube"
        }
      ]
    });
    const litCubePixel = findPixel(cubeCanvas, { x: 0, y: 0, width: cubeCanvas.width, height: cubeCanvas.height }, (r, g, b) => r > 40 && g > 80 && b > 110);
    cubeRenderer.dispose();

    const texturedCanvas = requireCanvas("textured-cube");
    const texturedRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: texturedCanvas,
      width: texturedCanvas.width,
      height: texturedCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const texturedCubeDiagnostics = texturedRenderer.render([
      {
        geometry: Geometry.texturedCube(1.25),
        material: new TexturedUnlitMaterial({
          texture: createCheckerTexture(),
          sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest" })
        }),
        label: "browser-textured-cube"
      }
    ]);
    const texturedCubePixel = readPixel(texturedCanvas, 48, 48);
    texturedRenderer.dispose();

    const texturedPbrNoTangentCanvas = requireCanvas("textured-pbr-no-tangent");
    const texturedPbrNoTangentRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: texturedPbrNoTangentCanvas,
      width: texturedPbrNoTangentCanvas.width,
      height: texturedPbrNoTangentCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const texturedPbrNoTangentScene = new Scene();
    const texturedPbrNoTangentLight = texturedPbrNoTangentScene.createLight("directional", "browser-no-tangent-key");
    texturedPbrNoTangentLight.intensity = 0.8;
    texturedPbrNoTangentLight.color = [1, 0.9, 0.75];
    texturedPbrNoTangentScene.root.addChild(texturedPbrNoTangentLight);
    const texturedPbrNoTangentDiagnostics = texturedPbrNoTangentRenderer.render({
      scene: texturedPbrNoTangentScene,
      renderItems: [
        {
          geometry: createTexturedTriangleWithoutTangents(),
          material: new TexturedPBRMaterial({
            baseColorTexture: new Texture({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([220, 116, 42, 255]) }),
            roughness: 0.45,
            metallic: 0.05
          }),
          label: "browser-textured-pbr-no-tangent"
        }
      ]
    });
    const texturedPbrNoTangentPixel = findPixel(texturedPbrNoTangentCanvas, { x: 16, y: 18, width: 64, height: 64 }, (r, g, b, a) => r > 90 && g > 35 && b < 80 && a === 255);
    texturedPbrNoTangentRenderer.dispose();

    const textureFallbackCanvas = requireCanvas("texture-fallback");
    const textureFallbackRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: textureFallbackCanvas,
      width: textureFallbackCanvas.width,
      height: textureFallbackCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const textureFallbackDiagnostics = textureFallbackRenderer.render([
      {
        geometry: Geometry.texturedCube(1.25),
        material: new Material({
          name: "browser-texture-fallback-material",
          shaderKey: DEFAULT_TEXTURED_UNLIT_SHADER_NAME,
          parameters: {
            u_baseColor: [0.45, 0.25, 0.75, 1],
            u_baseColorTexture: new TextureBinding({ name: "u_baseColorTexture", required: false }),
            u_baseColorTextureOffset: [0, 0],
            u_baseColorTextureScale: [1, 1],
            u_baseColorTextureRotation: 0,
            u_modelViewProjection: identityMatrix()
          },
          requiredAttributes: ["a_position", "a_uv"],
          uniformSchema: [
            { name: "u_baseColor", kind: "vec4" },
            { name: "u_baseColorTexture", kind: "texture2d" },
            { name: "u_baseColorTextureOffset", kind: "vec2" },
            { name: "u_baseColorTextureScale", kind: "vec2" },
            { name: "u_baseColorTextureRotation", kind: "float" },
            { name: "u_modelViewProjection", kind: "mat4" }
          ]
        }),
        label: "browser-texture-fallback-cube"
      }
    ]);
    const textureFallbackPixel = readPixel(textureFallbackCanvas, 48, 48);
    textureFallbackRenderer.dispose();

    const normalMapCanvas = requireCanvas("normal-map");
    const normalMapRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: normalMapCanvas,
      width: normalMapCanvas.width,
      height: normalMapCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const normalMapScene = new Scene();
    const normalMapLight = normalMapScene.createLight("directional", "browser-normal-map-key");
    normalMapLight.intensity = 0.7;
    normalMapLight.color = [1, 1, 1];
    normalMapLight.transform.setRotation(0, 1, 0, 0);
    normalMapScene.root.addChild(normalMapLight);
    const normalMapDiagnostics = normalMapRenderer.render({
      scene: normalMapScene,
      renderItems: [
        {
          geometry: Geometry.texturedCube(1.25),
          material: new NormalMappedPBRMaterial({
            baseColor: [0.58, 0.68, 0.9, 1],
            renderState: { cullMode: "none" },
            roughness: 0.4,
            normalScale: 1,
            normalTexture: createNormalMapTexture(),
            normalSampler: new Sampler({ minFilter: "nearest", magFilter: "nearest" })
          }),
          label: "browser-normal-mapped-cube"
        }
      ]
    });
    const normalMapPixel = readPixel(normalMapCanvas, 48, 48);
    normalMapRenderer.dispose();

    const morphCanvas = requireCanvas("morph-scene");
    const morphRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: morphCanvas,
      width: morphCanvas.width,
      height: morphCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const morphScene = new Scene();
    const morphNode = morphScene.createNode("browser-morphed-scene-triangle");
    morphScene.root.addChild(morphNode);
    morphScene.addRenderable(morphNode, new Renderable({
      geometry: "geometry:morph-triangle",
      material: "material:morph-unlit",
      morphWeights: [1]
    }));
    const morphSceneDiagnostics = morphRenderer.render({
      scene: morphScene,
      geometryLibrary: {
        "geometry:morph-triangle": Geometry.triangle()
      },
      materialLibrary: {
        "material:morph-unlit": new UnlitMaterial({ color: [0.95, 0.12, 0.9, 1] })
      },
      morphTargetLibrary: {
        "geometry:morph-triangle": [{ positions: [[0, 0, 0], [0, 0, 0], [0, 0.4, 0]] }]
      }
    });
    const morphScenePixel = findPixel(morphCanvas, { x: 20, y: 48, width: 24, height: 14 }, (r, g, b, a) => r > 150 && g < 80 && b > 120 && a === 255);
    morphRenderer.dispose();

    const gpuMorphCanvas = requireCanvas("gpu-morph-scene");
    const gpuMorphRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: gpuMorphCanvas,
      width: gpuMorphCanvas.width,
      height: gpuMorphCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const gpuMorphScene = new Scene();
    const gpuMorphNode = gpuMorphScene.createNode("browser-gpu-morphed-scene-triangle");
    gpuMorphScene.root.addChild(gpuMorphNode);
    gpuMorphScene.addRenderable(gpuMorphNode, new Renderable({
      geometry: "geometry:gpu-morph-triangle",
      material: "material:gpu-morph-unlit",
      morphWeights: [0.5, 0.5]
    }));
    const gpuMorphSceneDiagnostics = gpuMorphRenderer.render({
      scene: gpuMorphScene,
      geometryLibrary: {
        "geometry:gpu-morph-triangle": Geometry.triangle()
      },
      materialLibrary: {
        "material:gpu-morph-unlit": new MorphUnlitMaterial({ color: [0.1, 0.95, 0.85, 1] })
      },
      morphTargetLibrary: {
        "geometry:gpu-morph-triangle": [
          { positions: [[0, 0, 0], [0, 0, 0], [0, 0.4, 0]] },
          { positions: [[0, 0, 0], [0, 0, 0], [0, 0.4, 0]] }
        ]
      }
    });
    const gpuMorphScenePixel = findPixel(gpuMorphCanvas, { x: 20, y: 48, width: 24, height: 14 }, (r, g, b, a) => r < 80 && g > 150 && b > 120 && a === 255);
    gpuMorphRenderer.dispose();

    const instancedCanvas = requireCanvas("instanced");
    const instancedRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: instancedCanvas,
      width: instancedCanvas.width,
      height: instancedCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const instancedDiagnostics = instancedRenderer.render([
      {
        geometry: Geometry.triangle(),
        material: new InstancedUnlitMaterial({ color: [0.9, 0.25, 0.1, 1] }),
        instanceTransforms: new Float32Array([
          ...translationMatrix(-0.55, 0, 0),
          ...translationMatrix(0.55, 0, 0)
        ]),
        label: "browser-instanced-triangles"
      }
    ]);
    const instancedLeftPixel = findPixel(instancedCanvas, { x: 4, y: 20, width: 24, height: 28 }, (r, g, b, a) => r > 160 && g > 35 && g < 100 && b < 60 && a === 255);
    const instancedRightPixel = findPixel(instancedCanvas, { x: 36, y: 20, width: 24, height: 28 }, (r, g, b, a) => r > 160 && g > 35 && g < 100 && b < 60 && a === 255);
    instancedRenderer.dispose();

    const instancedPbrCanvas = requireCanvas("instanced-pbr");
    const instancedPbrRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: instancedPbrCanvas,
      width: instancedPbrCanvas.width,
      height: instancedPbrCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const instancedPbrDiagnostics = instancedPbrRenderer.render([
      {
        geometry: Geometry.litTriangle(),
        material: new InstancedPBRMaterial({
          baseColor: [0.28, 0.86, 1, 1],
          roughness: 0.7,
          emissiveColor: [0.2, 0.92, 0.92]
        }),
        instanceTransforms: new Float32Array([
          ...translationMatrix(-0.55, 0, 0),
          ...translationMatrix(0.55, 0, 0)
        ]),
        label: "browser-instanced-pbr-triangles"
      }
    ]);
    const instancedPbrLeftPixel = findPixel(instancedPbrCanvas, { x: 4, y: 20, width: 24, height: 28 }, (r, g, b, a) => r > 120 && g > r + 20 && b > r + 20 && a === 255);
    const instancedPbrRightPixel = findPixel(instancedPbrCanvas, { x: 36, y: 20, width: 24, height: 28 }, (r, g, b, a) => r > 120 && g > r + 20 && b > r + 20 && a === 255);
    instancedPbrRenderer.dispose();

    const emissiveCanvas = requireCanvas("emissive");
    const emissiveRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: emissiveCanvas,
      width: emissiveCanvas.width,
      height: emissiveCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const emissiveDiagnostics = emissiveRenderer.render([
      {
        geometry: Geometry.litTriangle(),
        material: new PBRMaterial({
          baseColor: [0.62, 0.9, 0.52, 1],
          roughness: 0.8,
          emissiveColor: [0.15, 0.85, 0.25]
        }),
        label: "browser-pbr-emissive"
      }
    ]);
    const emissivePixel = readPixel(emissiveCanvas, 32, 32);
    emissiveRenderer.dispose();

    const environmentCanvas = requireCanvas("pbr-environment");
    const environmentRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: environmentCanvas,
      width: environmentCanvas.width,
      height: environmentCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const environmentDiagnostics = environmentRenderer.render({
      renderItems: [
        {
          geometry: Geometry.litTriangle(),
          material: new PBRMaterial({ baseColor: [0.72, 0.72, 0.72, 1], roughness: 0.6 }),
          label: "browser-pbr-environment-ambient"
        }
      ],
      environmentLighting: {
        color: [0.24, 0.48, 1],
        intensity: 0.35,
        proceduralMap: {
          skyColor: [0.05, 0.34, 1],
          horizonColor: [0.08, 0.48, 0.86],
          groundColor: [0.02, 0.06, 0.1],
          specularColor: [0.2, 0.62, 1],
          intensity: 0.85,
          specularIntensity: 0.12
        },
        environmentMapTexture: new TextureBinding({
          name: "u_environmentMapTexture",
          texture: new Texture({
            width: 2,
            height: 1,
            colorSpace: "srgb",
            data: new Uint8Array([10, 90, 255, 255, 50, 180, 255, 255])
          }),
          sampler: new Sampler({ addressU: "repeat" }),
          expectedColorSpace: "srgb",
          required: true
        }),
        environmentMapIntensity: 0.2,
        environmentMapSpecularIntensity: 0.08,
        environmentBrdfLutTexture: new TextureBinding({
          name: "u_environmentBrdfLutTexture",
          texture: new Texture({
            width: 2,
            height: 2,
            colorSpace: "linear",
            data: new Uint8Array([255, 255, 255, 255, 200, 200, 200, 255, 160, 160, 160, 255, 110, 110, 110, 255])
          }),
          expectedColorSpace: "linear",
          required: true
        })
      }
    });
    const environmentPixel = readPixel(environmentCanvas, 32, 32);
    environmentRenderer.dispose();

    const localCanvas = requireCanvas("pbr-local");
    const localRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: localCanvas,
      width: localCanvas.width,
      height: localCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const localScene = new Scene();
    const point = localScene.createLight("point", "browser-point") as PointLight;
    point.intensity = 2.5;
    point.color = [0.2, 0.65, 1];
    point.transform.setPosition(0, 0, 1);
    point.range = 3;
    localScene.root.addChild(point);
    const spot = localScene.createLight("spot", "browser-spot") as SpotLight;
    spot.intensity = 2;
    spot.color = [1, 0.45, 0.2];
    spot.transform.setPosition(0, 0, 1.2);
    spot.angle = Math.PI / 5;
    spot.penumbra = 0.2;
    localScene.root.addChild(spot);
    const localLightDiagnostics = localRenderer.render({
      scene: localScene,
      environmentLighting: false,
      renderItems: [
        {
          geometry: Geometry.litTriangle(),
          material: new PBRMaterial({ baseColor: [0.7, 0.7, 0.7, 1], roughness: 0.3, environmentIntensity: 0 }),
          label: "browser-pbr-local-lights"
        }
      ]
    });
    const localLightPixel = readPixel(localCanvas, 32, 32);
    localRenderer.dispose();

    const outCanvas = requireCanvas("pbr-local-out");
    const outRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: outCanvas,
      width: outCanvas.width,
      height: outCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const outScene = new Scene();
    const farPoint = outScene.createLight("point", "browser-far-point") as PointLight;
    farPoint.intensity = 3;
    farPoint.color = [1, 1, 1];
    farPoint.transform.setPosition(4, 0, 1);
    farPoint.range = 0.5;
    outScene.root.addChild(farPoint);
    const outOfRangeDiagnostics = outRenderer.render({
      scene: outScene,
      environmentLighting: false,
      renderItems: [
        {
          geometry: Geometry.litTriangle(),
          material: new PBRMaterial({ baseColor: [0.7, 0.7, 0.7, 1], roughness: 0.3, environmentIntensity: 0 }),
          label: "browser-pbr-local-out-of-range"
        }
      ]
    });
    const outOfRangePixel = readPixel(outCanvas, 32, 32);
    outRenderer.dispose();

    const shadowCanvas = requireCanvas("shadow-map-integration");
    const shadowRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: shadowCanvas,
      width: shadowCanvas.width,
      height: shadowCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const shadowLight = new DirectionalLight("browser-shadow-light");
    shadowLight.castsShadow = true;
    shadowLight.intensity = 1.2;
    shadowLight.color = [1, 1, 1];
    const shadowScene = new Scene();
    shadowScene.root.addChild(shadowLight);
    const lightMatrix = identityMatrix();
    const shadowPass = new ShadowPass({
      light: shadowLight,
      casters: [{
        geometry: Geometry.litTriangle(),
        material: new PBRMaterial({ baseColor: [0.8, 0.8, 0.8, 1] }),
        modelMatrix: scaleTranslationMatrix(-0.38, -0.05, -0.46, 0.72, 0.72, 1),
        label: "browser-shadow-caster"
      }],
      viewProjectionMatrix: lightMatrix
    });
    shadowRenderer.device.beginFrame(shadowCanvas.width, shadowCanvas.height);
    const shadowResult = shadowPass.execute({ device: shadowRenderer.device, width: shadowCanvas.width, height: shadowCanvas.height });
    shadowRenderer.device.endFrame();
    const forwardShadowMap = shadowPass.getForwardShadowMap({
      lightMatrix,
      strength: 0.85,
      bias: 0,
      slopeBias: 0,
      texelSize: [1 / 128, 1 / 128]
    });
    if (!shadowResult.rendered || !forwardShadowMap) {
      throw new Error(`Shadow map integration setup failed: ${shadowResult.reason}`);
    }
    const receiverMaterial = new PBRMaterial({ baseColor: [0.72, 0.72, 0.72, 1], roughness: 0.85, environmentIntensity: 0 });
    const shadowMapDiagnostics = shadowRenderer.render({
      scene: shadowScene,
      renderItems: [
        {
          geometry: Geometry.litTriangle(),
          material: receiverMaterial,
          modelMatrix: scaleTranslationMatrix(-0.38, -0.05, 0.18, 0.72, 0.72, 1),
          label: "browser-shadowed-receiver"
        },
        {
          geometry: Geometry.litTriangle(),
          material: receiverMaterial,
          modelMatrix: scaleTranslationMatrix(0.38, -0.05, 0.18, 0.72, 0.72, 1),
          label: "browser-lit-receiver"
        }
      ],
      shadowMap: forwardShadowMap
    });
    const shadowedReceiverPixel = findPixel(shadowCanvas, { x: 22, y: 30, width: 18, height: 24 }, (_r, _g, _b, a) => a === 255);
    const litReceiverPixel = findPixel(shadowCanvas, { x: 56, y: 30, width: 18, height: 24 }, (_r, _g, _b, a) => a === 255);
    shadowPass.dispose();
    shadowRenderer.dispose();

    const postprocessDepthCanvas = requireCanvas("postprocess-depth");
    const postprocessDepthRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: postprocessDepthCanvas,
      width: postprocessDepthCanvas.width,
      height: postprocessDepthCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    postprocessDepthRenderer.render({
      cameraPolicy: "identity",
      renderItems: [
        {
          geometry: Geometry.triangle(),
          material: new UnlitMaterial({ color: [0.02, 0.95, 0.16, 1] }),
          modelMatrix: translationMatrix(0, 0, -0.45),
          label: "postprocess-depth-near-green"
        },
        {
          geometry: Geometry.triangle(),
          material: new UnlitMaterial({ color: [1, 0.05, 0.02, 1] }),
          modelMatrix: translationMatrix(0, 0, 0.45),
          label: "postprocess-depth-far-red"
        }
      ],
      postprocess: {
        toneMapping: { exposure: 1, operator: "linear", inputColorSpace: "linear", outputColorSpace: "srgb" },
        ssao: { radius: 1, intensity: 0.2, bias: 0.01 }
      }
    });
    const postprocessDepthPixel = readPixel(postprocessDepthCanvas, 32, 32);
    postprocessDepthRenderer.dispose();

    const bufferCanvas = requireCanvas("buffer");
    const device = await createRenderDevice({ backend: "webgl2", canvas: bufferCanvas });
    const gpuBuffer = device.createBuffer("vertex", 16, new Float32Array([1, 2, 3, 4]));
    const bufferReadback = Array.from(new Float32Array(device.readBuffer(gpuBuffer).buffer));
    const renderTarget = device.createRenderTarget({ width: 16, height: 16, label: "browser-offscreen-target" });
    device.beginFrame(64, 64);
    device.setRenderTarget(renderTarget);
    const renderTargetState = device.captureState();
    const renderTargetViewport = {
      width: Number(renderTargetState.get("actualViewportWidth") ?? renderTargetState.get("viewportWidth") ?? 0),
      height: Number(renderTargetState.get("actualViewportHeight") ?? renderTargetState.get("viewportHeight") ?? 0),
      target: typeof renderTargetState.get("renderTarget") === "string" ? String(renderTargetState.get("renderTarget")) : null
    };
    device.clear([0.2, 0.6, 0.1, 1]);
    const renderTargetReadback = Array.from(device.readPixels(8, 8, 1, 1));
    device.setRenderTarget(null);
    const backbufferState = device.captureState();
    const backbufferViewportAfterTarget = {
      width: Number(backbufferState.get("actualViewportWidth") ?? backbufferState.get("viewportWidth") ?? 0),
      height: Number(backbufferState.get("actualViewportHeight") ?? backbufferState.get("viewportHeight") ?? 0),
      target: typeof backbufferState.get("renderTarget") === "string" ? String(backbufferState.get("renderTarget")) : null
    };
    device.endFrame();
    const renderTargetDiagnostics = device.getDiagnostics();
    renderTarget.dispose();

    let hdrRenderTargetReadback: readonly number[] | null = null;
    let hdrRenderTargetFormat: string | null = null;
    if (device.info.capabilities?.includes("hdr-render-targets") && device.info.capabilities?.includes("float-readback")) {
      const hdrTarget = device.createRenderTarget({ width: 2, height: 1, label: "browser-hdr-target", format: "rgba16f", depth: false });
      device.beginFrame(64, 64);
      device.setRenderTarget(hdrTarget);
      device.clear([2.5, 0.5, 0.125, 1]);
      hdrRenderTargetReadback = Array.from(device.readFloatPixels(0, 0, 1, 1)).map((value) => Number(value.toFixed(4)));
      hdrRenderTargetFormat = hdrTarget.colorTexture.format;
      device.setRenderTarget(null);
      device.endFrame();
      hdrTarget.dispose();
    }

    const renderTargetAfterDispose = device.getDiagnostics();
    device.dispose();

    const contextLoss = await runContextLossCheck();

    window.__AURA3D_RENDERING_TEST__ = {
      status: "ready",
      diagnostics,
      lineDiagnostics,
      pointDiagnostics,
      cubeDiagnostics,
      pbrDiagnostics,
      pbrSphereDiagnostics,
      litCubeDiagnostics,
      texturedCubeDiagnostics,
      texturedPbrNoTangentDiagnostics,
      textureFallbackDiagnostics,
      normalMapDiagnostics,
      morphSceneDiagnostics,
      gpuMorphSceneDiagnostics,
      instancedDiagnostics,
      instancedPbrDiagnostics,
      emissiveDiagnostics,
      environmentDiagnostics,
      localLightDiagnostics,
      outOfRangeDiagnostics,
      centerPixel,
      linePixel,
      pointPixel,
      cubePixel,
      pbrCenterPixel,
      pbrSphereCenterPixel,
      pbrSphereRimPixel,
      litCubePixel,
      texturedCubePixel,
      texturedPbrNoTangentPixel,
      textureFallbackPixel,
      normalMapPixel,
      morphScenePixel,
      gpuMorphScenePixel,
      instancedLeftPixel,
      instancedRightPixel,
      instancedPbrLeftPixel,
      instancedPbrRightPixel,
      emissivePixel,
      environmentPixel,
      localLightPixel,
      outOfRangePixel,
      shadowMapDiagnostics,
      shadowedReceiverPixel,
      litReceiverPixel,
      canvasFrame: { width: renderCanvas.width, height: renderCanvas.height },
      bufferReadback,
      renderTargetReadback,
      hdrRenderTargetReadback,
      hdrRenderTargetFormat,
      postprocessDepthPixel,
      renderTargetViewport,
      backbufferViewportAfterTarget,
      renderTargetDiagnostics,
      renderTargetAfterDispose,
      contextLoss
    };
  } catch (error) {
    window.__AURA3D_RENDERING_TEST__ = {
      status: "error",
      error: error instanceof Error ? `${error.stack ?? error.message}${formatErrorDiagnostics(error)}` : String(error)
    };
  }
}

function formatErrorDiagnostics(error: Error): string {
  const diagnostics = (error as { readonly diagnostics?: unknown }).diagnostics;
  return Array.isArray(diagnostics) && diagnostics.length > 0
    ? `\nDiagnostics:\n${diagnostics.map((entry) => `- ${String(entry)}`).join("\n")}`
    : "";
}

function translationMatrix(x: number, y: number, z: number): readonly number[] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ];
}

function scaleTranslationMatrix(x: number, y: number, z: number, scaleX: number, scaleY: number, scaleZ: number): readonly number[] {
  return [
    scaleX, 0, 0, 0,
    0, scaleY, 0, 0,
    0, 0, scaleZ, 0,
    x, y, z, 1
  ];
}

function createCheckerTexture(): Texture {
  return new Texture({
    width: 2,
    height: 2,
    format: "rgba8",
    colorSpace: "srgb",
    label: "browser-checker",
    data: new Uint8Array([
      36, 216, 108, 255,
      36, 216, 108, 255,
      36, 216, 108, 255,
      36, 216, 108, 255
    ])
  });
}

function createTexturedTriangleWithoutTangents(): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3N3T2, 3);
  vertices.setAttribute(0, "position", [-0.72, -0.68, 0]);
  vertices.setAttribute(0, "normal", [0, 0, 1]);
  vertices.setAttribute(0, "uv", [0, 0]);
  vertices.setAttribute(1, "position", [0.72, -0.68, 0]);
  vertices.setAttribute(1, "normal", [0, 0, 1]);
  vertices.setAttribute(1, "uv", [1, 0]);
  vertices.setAttribute(2, "position", [0, 0.68, 0]);
  vertices.setAttribute(2, "normal", [0, 0, 1]);
  vertices.setAttribute(2, "uv", [0.5, 1]);
  return new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
}

function createNormalMapTexture(): Texture {
  return new Texture({
    width: 2,
    height: 2,
    format: "rgba8",
    colorSpace: "linear",
    label: "browser-normal-map",
    data: new Uint8Array([
      255, 128, 255, 255,
      255, 128, 255, 255,
      255, 128, 255, 255,
      255, 128, 255, 255
    ])
  });
}

function identityMatrix(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}

async function runContextLossCheck(): Promise<NonNullable<RenderingHarnessResult["contextLoss"]>> {
  const canvas = requireCanvas("context-loss");
  const gl = canvas.getContext("webgl2");
  const extension = gl?.getExtension("WEBGL_lose_context");
  if (!gl || !extension) {
    return { supported: false, contextLost: false, lastError: null };
  }

  const device = await createRenderDevice({ backend: "webgl2", canvas });
  extension.loseContext();
  await waitFor(() => device.getDiagnostics().contextLost);

  let thrownCode: string | undefined;
  try {
    device.beginFrame(8, 8);
  } catch (error) {
    thrownCode = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : undefined;
  }

  const diagnostics = device.getDiagnostics();
  device.dispose();
  return {
    supported: true,
    contextLost: diagnostics.contextLost,
    lastError: diagnostics.lastError,
    thrownCode
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  throw new Error("Timed out waiting for WebGL context loss.");
}

function requireCanvas(id: string): HTMLCanvasElement {
  const canvas = document.getElementById(id);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`Missing canvas: ${id}`);
  }
  return canvas;
}

function readPixel(canvas: HTMLCanvasElement, x: number, y: number): readonly number[] {
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    throw new Error("WebGL2 context was not available for pixel readback");
  }
  const pixel = new Uint8Array(4);
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  return Array.from(pixel);
}

function findPixel(
  canvas: HTMLCanvasElement,
  region: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  predicate: (r: number, g: number, b: number, a: number) => boolean
): readonly number[] {
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    throw new Error("WebGL2 context was not available for pixel scan");
  }
  const pixels = new Uint8Array(region.width * region.height * 4);
  gl.readPixels(region.x, region.y, region.width, region.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    const a = pixels[index + 3] ?? 0;
    if (predicate(r, g, b, a)) {
      return [r, g, b, a];
    }
  }
  let brightest: readonly number[] = [0, 0, 0, 0];
  let brightestEnergy = -1;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    const a = pixels[index + 3] ?? 0;
    const energy = r + g + b;
    if (energy > brightestEnergy) {
      brightestEnergy = energy;
      brightest = [r, g, b, a];
    }
  }
  return brightest;
}

void run();
