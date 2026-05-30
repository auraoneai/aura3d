// Readable 3D text labels rendered as camera-facing sprites.
//
// The Aura3D declarative scene has no text node, so axis labels are added at
// the renderer level: text is drawn to a high-DPI 2D canvas, uploaded as a
// texture and mapped onto a THREE.Sprite so it always faces the orbit camera
// and stays legible from any angle.
import * as THREE from "three";

export interface TextSpriteOptions {
  /** Target world height of the label, in scene units. */
  worldHeight?: number;
  color?: string;
  background?: string;
  bold?: boolean;
  padding?: number;
}

export function makeTextSprite(
  text: string,
  options: TextSpriteOptions = {},
): THREE.Sprite {
  const {
    worldHeight = 0.5,
    color = "#eaf1ff",
    background = "rgba(10,16,34,0.72)",
    bold = true,
    padding = 26,
  } = options;

  const dpr = 2;
  const fontSize = 64;
  const font = `${bold ? "700" : "500"} ${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;

  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d")!;
  measureCtx.font = font;
  const textWidth = Math.ceil(measureCtx.measureText(text).width);

  const widthPx = textWidth + padding * 2;
  const heightPx = fontSize + padding * 2;

  const canvas = document.createElement("canvas");
  canvas.width = widthPx * dpr;
  canvas.height = heightPx * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  // Rounded pill background for contrast against the scene.
  const radius = 16;
  ctx.fillStyle = background;
  roundRect(ctx, 0, 0, widthPx, heightPx, radius);
  ctx.fill();
  ctx.strokeStyle = "rgba(120,150,210,0.55)";
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, widthPx - 2, heightPx - 2, radius);
  ctx.stroke();

  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, widthPx / 2, heightPx / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  sprite.renderOrder = 10;

  const aspect = widthPx / heightPx;
  sprite.scale.set(worldHeight * aspect, worldHeight, 1);
  return sprite;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
