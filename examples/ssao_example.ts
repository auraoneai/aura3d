/**
 * SSAO (Screen-Space Ambient Occlusion) Example
 *
 * Demonstrates how to use the SSAOPass in the G3D rendering pipeline.
 * Shows hemisphere sampling-based ambient occlusion with bilateral blur.
 */

import { Renderer, RendererBackend, RenderMode } from '../src/rendering/Renderer';
import { Scene } from '../src/rendering/scene/Scene';
import { Camera } from '../src/rendering/camera/Camera';
import { SSAOPass, SSAOQuality } from '../src/rendering/passes/SSAOPass';
import { Mesh } from '../src/rendering/geometry/Mesh';
import { StandardPBRMaterial } from '../src/rendering/material/StandardPBRMaterial';
import { SceneNode } from '../src/rendering/scene/SceneNode';
import { Vector3 } from '../src/math/Vector3';
import { Color } from '../src/math/Color';

/**
 * Creates a simple test scene with geometry to demonstrate SSAO.
 */
function createTestScene(): Scene {
  const scene = new Scene('SSAO Demo Scene');

  // Create a ground plane
  const groundNode = new SceneNode('Ground');
  groundNode.mesh = Mesh.createPlane(20, 20, 1, 1);
  groundNode.material = new StandardPBRMaterial({
    albedo: new Color(0.7, 0.7, 0.7),
    roughness: 0.8,
    metallic: 0.0,
  });
  groundNode.transform.position.set(0, 0, 0);
  scene.addChild(groundNode);

  // Create spheres with varying distances (to test occlusion)
  for (let i = 0; i < 5; i++) {
    const sphereNode = new SceneNode(`Sphere_${i}`);
    sphereNode.mesh = Mesh.createSphere(1.0, 32, 16);
    sphereNode.material = new StandardPBRMaterial({
      albedo: new Color(0.8, 0.3, 0.3),
      roughness: 0.5,
      metallic: 0.0,
    });
    sphereNode.transform.position.set(i * 3 - 6, 1, 0);
    scene.addChild(sphereNode);
  }

  // Create a complex mesh (Stanford bunny or torus) to show detailed AO
  const torusNode = new SceneNode('Torus');
  torusNode.mesh = Mesh.createTorus(1.5, 0.5, 32, 16);
  torusNode.material = new StandardPBRMaterial({
    albedo: new Color(0.3, 0.8, 0.3),
    roughness: 0.4,
    metallic: 0.1,
  });
  torusNode.transform.position.set(0, 2, 5);
  scene.addChild(torusNode);

  return scene;
}

/**
 * Main SSAO example.
 */
async function main() {
  // Get canvas element
  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Canvas element not found!');
    return;
  }

  // Create renderer with deferred rendering mode (required for SSAO)
  const renderer = await Renderer.create({
    canvas,
    backend: RendererBackend.WebGL2,
    renderMode: RenderMode.Deferred,
    width: canvas.width,
    height: canvas.height,
    quality: 'high',
    hdr: true,
    enableProfiling: true,
  });

  console.log('Renderer created:', renderer.toString());

  // Create scene
  const scene = createTestScene();

  // Create camera
  const camera = new Camera();
  camera.setPerspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100.0);
  camera.transform.position.set(0, 5, 15);
  camera.transform.lookAt(new Vector3(0, 1, 0));

  // Access the SSAO pass from the renderer (already created in setupDeferredPipeline)
  // You can configure it at runtime:
  const ssaoPass = (renderer as any).ssaoPass as SSAOPass;

  if (ssaoPass) {
    console.log('SSAO Pass found and active');

    // Configure SSAO parameters
    ssaoPass.setRadius(0.5);       // Sampling radius in view space
    ssaoPass.setIntensity(1.2);    // Occlusion intensity
    ssaoPass.setBlurRadius(4);     // Denoising blur radius
    ssaoPass.setEnabled(true);     // Enable/disable effect
  } else {
    console.warn('SSAO Pass not found - check RenderSettings.ssaoEnabled');
  }

  // Add some lights to the scene
  const lightManager = renderer.getLightManager();

  // Directional light (sun)
  lightManager.addDirectionalLight({
    direction: new Vector3(0.5, -0.8, 0.3).normalize(),
    color: new Color(1.0, 0.98, 0.92),
    intensity: 3.0,
    castShadows: true,
  });

  // Point light for additional illumination
  lightManager.addPointLight({
    position: new Vector3(-5, 3, 5),
    color: new Color(0.8, 0.9, 1.0),
    intensity: 2.0,
    range: 15.0,
    castShadows: false,
  });

  // Render loop
  let frameCount = 0;
  let lastTime = performance.now();

  function render() {
    const currentTime = performance.now();
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    // Rotate camera around scene
    const angle = frameCount * 0.005;
    camera.transform.position.set(
      Math.cos(angle) * 15,
      5,
      Math.sin(angle) * 15
    );
    camera.transform.lookAt(new Vector3(0, 1, 0));

    // Render scene with SSAO
    renderer.render(scene, camera);

    // Display stats
    if (frameCount % 60 === 0) {
      const stats = renderer.getStats();
      console.log(`Frame ${frameCount}: FPS=${stats.fps.toFixed(1)}, DrawCalls=${stats.drawCalls}, Lights=${stats.lights}`);
    }

    frameCount++;
    requestAnimationFrame(render);
  }

  // Start render loop
  render();

  // Handle window resize
  window.addEventListener('resize', () => {
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight;
    canvas.width = newWidth;
    canvas.height = newHeight;
    renderer.resize(newWidth, newHeight);
    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();
  });

  // UI controls for SSAO parameters
  setupUI(ssaoPass);

  console.log('SSAO example running. Use UI controls to adjust SSAO parameters.');
}

/**
 * Sets up UI controls for SSAO parameters.
 */
function setupUI(ssaoPass: SSAOPass | null) {
  if (!ssaoPass) return;

  // Create UI container
  const uiContainer = document.createElement('div');
  uiContainer.style.position = 'absolute';
  uiContainer.style.top = '10px';
  uiContainer.style.right = '10px';
  uiContainer.style.background = 'rgba(0, 0, 0, 0.7)';
  uiContainer.style.color = 'white';
  uiContainer.style.padding = '15px';
  uiContainer.style.fontFamily = 'monospace';
  uiContainer.style.fontSize = '12px';
  uiContainer.style.borderRadius = '5px';
  uiContainer.innerHTML = `
    <h3 style="margin: 0 0 10px 0;">SSAO Controls</h3>
    <label>
      Enabled: <input type="checkbox" id="ssao-enabled" checked />
    </label><br/>
    <label>
      Radius: <input type="range" id="ssao-radius" min="0.1" max="2.0" step="0.1" value="0.5" />
      <span id="ssao-radius-value">0.5</span>
    </label><br/>
    <label>
      Intensity: <input type="range" id="ssao-intensity" min="0.0" max="3.0" step="0.1" value="1.2" />
      <span id="ssao-intensity-value">1.2</span>
    </label><br/>
    <label>
      Blur Radius: <input type="range" id="ssao-blur" min="0" max="8" step="1" value="4" />
      <span id="ssao-blur-value">4</span>
    </label>
  `;
  document.body.appendChild(uiContainer);

  // Wire up controls
  const enabledCheckbox = document.getElementById('ssao-enabled') as HTMLInputElement;
  const radiusSlider = document.getElementById('ssao-radius') as HTMLInputElement;
  const radiusValue = document.getElementById('ssao-radius-value') as HTMLSpanElement;
  const intensitySlider = document.getElementById('ssao-intensity') as HTMLInputElement;
  const intensityValue = document.getElementById('ssao-intensity-value') as HTMLSpanElement;
  const blurSlider = document.getElementById('ssao-blur') as HTMLInputElement;
  const blurValue = document.getElementById('ssao-blur-value') as HTMLSpanElement;

  enabledCheckbox.addEventListener('change', () => {
    ssaoPass.setEnabled(enabledCheckbox.checked);
  });

  radiusSlider.addEventListener('input', () => {
    const value = parseFloat(radiusSlider.value);
    ssaoPass.setRadius(value);
    radiusValue.textContent = value.toFixed(1);
  });

  intensitySlider.addEventListener('input', () => {
    const value = parseFloat(intensitySlider.value);
    ssaoPass.setIntensity(value);
    intensityValue.textContent = value.toFixed(1);
  });

  blurSlider.addEventListener('input', () => {
    const value = parseInt(blurSlider.value);
    ssaoPass.setBlurRadius(value);
    blurValue.textContent = value.toString();
  });
}

// Run example
main().catch(console.error);
