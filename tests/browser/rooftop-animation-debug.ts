import { camera, createAuraApp, lights, model, scene } from '@aura3d/engine';
import { assets } from '../../src/aura-assets';

const query = new URLSearchParams(location.search);
const animate = query.get('animate') === '1';
const node = model(assets.rooftopLayupScorer, { name: 'athlete', targetHeight: 2.4 }).runtime({ id: 'athlete' });
const app = createAuraApp('#stage', {
  pixelRatio: 1,
  resize: false,
  renderer: { mode: 'production', qualityProfile: 'production', fallback: 'safe-basic' },
  scene: scene().background('#04070c').camera(camera.frameAsset(assets.rooftopLayupScorer, { targetHeight: 2.4, padding: 1.14, fov: 28, azimuth: 0.7, elevation: 0.28 })).add(node).add(lights.studio())
});
console.log('REGISTRY_CHECK', typeof (globalThis as any).__AURA3D_LIVE_APPS__, typeof (window as any).__AURA3D_LIVE_APPS__, (window as any).__AURA3D_LIVE_APPS__?.count?.());
await app.ready();
if (animate) app.nodes.require('athlete').play('Ready', { loop: true, restart: true, captureTime: 0.38 });
app.step(1 / 60);
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const png = canvas.toDataURL();
const image = new Image(); image.src = png;
await new Promise<void>((resolve) => { image.onload = () => resolve(); });
const data = document.createElement('canvas'); data.width = canvas.width; data.height = canvas.height;
const ctx = data.getContext('2d'); ctx?.drawImage(image, 0, 0);
const pixels = ctx?.getImageData(0, 0, data.width, data.height).data ?? new Uint8ClampedArray();
let non = 0; let minX = data.width; let minY = data.height; let maxX = 0; let maxY = 0;
for (let y = 0; y < data.height; y += 1) for (let x = 0; x < data.width; x += 1) {
  const i = (y * data.width + x) * 4; const diff = Math.abs(pixels[i]! - 4) + Math.abs(pixels[i + 1]! - 7) + Math.abs(pixels[i + 2]! - 12);
  if (diff > 24) { non += 1; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
}
document.body.dataset.result = JSON.stringify({ animate, diagnostics: app.diagnostics(), bounds: { non, x: minX, y: minY, width: maxX >= minX ? maxX - minX + 1 : 0, height: maxY >= minY ? maxY - minY + 1 : 0 }, png });
