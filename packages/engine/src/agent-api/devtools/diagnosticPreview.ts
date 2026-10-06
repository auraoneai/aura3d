// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraModelNode, AuraPrimitiveNode, AuraEffectNode, AuraLabelNode, AuraSceneSnapshot, AuraCreateAppOptions } from "../nodes/types.js";
import type { MutableDiagnostics } from "./diagnostics.js";
import { animatedPosition, primitiveSize } from "../compiler/sceneMath.js";
import { colorWithAlpha } from "../compiler/color.js";
import { getParticleLife, writeParticlePosition, seededRange } from "../compiler/effects.js";
import { labelDefaultPosition } from "../compiler/labels.js";
import { labels } from "../nodes/labels.js";
import { material } from "../nodes/material.js";
import { model } from "../nodes/model.js";
import { particles } from "../nodes/particles.js";
import { prefabs } from "../nodes/prefabs/index.js";
import { primitive } from "../nodes/primitives.js";
import { renderer } from "./rendererDiagnostics.js";
import { scene } from "../nodes/scene.js";
import { shadows } from "../nodes/shadows.js";
import { snapshotDiagnostics } from "./diagnostics.js";
import { ui } from "../nodes/ui.js";
import { water } from "../nodes/water.js";

/**
 * WS-2.5 — DIAGNOSTIC PREVIEW ONLY. Renamed from `renderSceneToCanvas`.
 *
 * This draws a scene with `getContext("2d")`: a linear gradient, a grid, and a coloured rectangle per
 * node. It is a *schematic*, not a render, and it has already produced one real defect class — world
 * labels reached the scene graph but were drawn only here, so every production callout was silently
 * dropped while evidence counted the nodes.
 *
 * The old name did not say any of that, and the old selection rule made it the fallback for anything
 * the WebGL path declined. A developer whose scene failed to qualify got a plausible-looking gradient
 * frame and no indication that they were not looking at their renderer.
 *
 * It is retained because a headless or non-renderable scene still benefits from *something* inspectable,
 * and because the diagnostics overlay uses it. What changed is that it is no longer reachable for a
 * scene that declares renderable content — see `mountCurrentScene`.
 */
export function renderDiagnosticPreviewToCanvas(canvas: HTMLCanvasElement | undefined, snapshot: AuraSceneSnapshot, time: number): number {
  if (!canvas) return 0;
  const context = canvas.getContext("2d");
  if (!context) return 0;
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, snapshot.background);
  gradient.addColorStop(1, shadeColor(snapshot.background, -32));
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  drawGrid(context, width, height);
  let drawCalls = 1;
  snapshot.nodes.forEach((node, index) => {
    if (node.kind === "model" || node.kind === "primitive") {
      drawRenderableNode(context, width, height, node, index, time);
      drawCalls += 1;
    }
    if (node.kind === "effect") {
      drawEffect(context, width, height, node, time);
      drawCalls += 1;
    }
    if (node.kind === "label") {
      drawLabelNode(context, width, height, node, index, time);
      drawCalls += 1;
    }
  });
  return drawCalls;
}

function drawGrid(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.save();
  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 1;
  const horizon = height * 0.68;
  for (let i = 0; i < 12; i += 1) {
    const y = horizon + i * 18;
    context.beginPath();
    context.moveTo(width * 0.12, y);
    context.lineTo(width * 0.88, y);
    context.stroke();
  }
  for (let i = -6; i <= 6; i += 1) {
    context.beginPath();
    context.moveTo(width * 0.5 + i * 38, horizon);
    context.lineTo(width * 0.5 + i * 80, height);
    context.stroke();
  }
  context.restore();
}

function drawRenderableNode(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  node: AuraModelNode | AuraPrimitiveNode,
  index: number,
  time: number
): void {
  const x = width * 0.5 + ((node.position?.[0] ?? index - 1) * width) / 8;
  const y = height * 0.58 - ((node.position?.[1] ?? 0) * height) / 7;
  const phase = Math.sin(time / 900 + index) * 8;
  const primitiveSize = node.kind === "primitive" ? node.size : undefined;
  const size = typeof primitiveSize === "number" ? primitiveSize * 80 : typeof node.scale === "number" ? node.scale * 80 : 92;
  const color = node.material?.color ?? (node.kind === "model" ? "#77a7ff" : "#d7dee8");
  context.save();
  context.shadowColor = "rgba(56,214,255,0.34)";
  context.shadowBlur = 24;
  context.fillStyle = color;
  if (node.kind === "primitive" && node.primitive === "sphere") {
    context.beginPath();
    context.arc(x, y + phase, size * 0.46, 0, Math.PI * 2);
    context.fill();
  } else if (node.kind === "primitive" && node.primitive === "capsule") {
    const capsuleWidth = size * 0.42;
    const capsuleHeight = size * 0.92;
    context.beginPath();
    context.roundRect(x - capsuleWidth / 2, y - capsuleHeight / 2 + phase, capsuleWidth, capsuleHeight, capsuleWidth / 2);
    context.fill();
  } else if (node.kind === "primitive" && node.primitive === "torus") {
    context.beginPath();
    context.arc(x, y + phase, size * 0.46, 0, Math.PI * 2);
    context.arc(x, y + phase, size * 0.32, 0, Math.PI * 2, true);
    context.fill("evenodd");
  } else if (node.kind === "primitive" && node.primitive === "cylinder") {
    context.beginPath();
    context.ellipse(x, y - size * 0.34 + phase, size * 0.46, size * 0.16, 0, 0, Math.PI * 2);
    context.rect(x - size * 0.46, y - size * 0.34 + phase, size * 0.92, size * 0.68);
    context.ellipse(x, y + size * 0.34 + phase, size * 0.46, size * 0.16, 0, 0, Math.PI * 2);
    context.fill();
  } else if (node.kind === "primitive" && node.primitive === "plane") {
    context.fillRect(x - size * 0.7, y - size * 0.16, size * 1.4, size * 0.32);
  } else {
    context.beginPath();
    context.moveTo(x, y - size * 0.58 + phase);
    context.lineTo(x + size * 0.54, y - size * 0.18 + phase);
    context.lineTo(x + size * 0.34, y + size * 0.55 + phase);
    context.lineTo(x - size * 0.42, y + size * 0.48 + phase);
    context.lineTo(x - size * 0.58, y - size * 0.16 + phase);
    context.closePath();
    context.fill();
  }
  context.shadowBlur = 0;
  context.fillStyle = "rgba(255,255,255,0.78)";
  context.font = `${Math.max(12, width / 72)}px system-ui, sans-serif`;
  context.textAlign = "center";
  const label = node.kind === "model" ? node.asset.id : node.name ?? node.primitive;
  const hideParticleImpostorLabel = node.kind === "primitive" && Boolean(node.name?.includes("water plume droplet") || node.name?.includes("water splash droplet") || node.name?.includes("benchmark plume particle") || node.name?.includes("collision splash particle"));
  if (!hideParticleImpostorLabel) context.fillText(label, x, y + size * 0.76 + phase);
  context.restore();
}

function drawLabelNode(context: CanvasRenderingContext2D, width: number, height: number, node: AuraLabelNode, index: number, time: number): void {
  const position = animatedPosition({ ...node, position: node.position ?? labelDefaultPosition(node) }, time);
  const x = width * 0.5 + (position[0] * width) / 5;
  const y = height * 0.58 - (position[1] * height) / 4 + index * 2;
  const fontSize = Math.max(12, Math.min(28, (node.size ?? 0.34) * 48));
  context.save();
  context.font = `700 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
  const metrics = context.measureText(node.text);
  const paddingX = 10;
  const paddingY = 6;
  const boxWidth = metrics.width + paddingX * 2;
  const boxHeight = fontSize + paddingY * 2;
  context.fillStyle = colorWithAlpha(node.background ?? "#020617", 0.82);
  context.strokeStyle = String(node.color ?? "#e0f2fe");
  context.lineWidth = 1.5;
  context.fillRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight);
  context.strokeRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight);
  context.fillStyle = String(node.color ?? "#e0f2fe");
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(node.text, x, y + 1);
  context.restore();
}

function drawEffect(context: CanvasRenderingContext2D, width: number, height: number, node: AuraEffectNode, time: number): void {
  context.save();
  if (node.effect === "fog") {
    context.fillStyle = toAlphaColor(node.color ?? "#9fb7d9", node.density ?? 0.12);
    context.fillRect(0, height * 0.2, width, height * 0.8);
  }
  if (node.effect === "volumetric-fog") {
    context.fillStyle = toAlphaColor(node.color ?? "#6f84b9", node.density ?? 0.18);
    context.fillRect(0, height * 0.2, width, height * 0.8);
    const anchor = node.lightPosition ?? [0.5, 0.18];
    const glow = context.createRadialGradient(width * anchor[0], height * anchor[1], 8, width * anchor[0], height * anchor[1], width * 0.3);
    glow.addColorStop(0, toAlphaColor(node.color ?? "#fff3d6", (node.intensity ?? 0.7) * 0.35));
    glow.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
  }
  if (node.effect === "bloom") {
    const gradient = context.createRadialGradient(width * 0.5, height * 0.45, 20, width * 0.5, height * 0.45, width * 0.46);
    gradient.addColorStop(0, toAlphaColor(node.color ?? "#ffffff", (node.intensity ?? 0.35) * 0.3));
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }
  if (node.effect === "ambient-occlusion" || node.effect === "contact-occlusion") {
    const gradient = context.createRadialGradient(width * 0.5, height * 0.68, 10, width * 0.5, height * 0.68, width * Math.max(0.08, node.radius ?? 0.42));
    gradient.addColorStop(0, toAlphaColor(node.color ?? "#020617", Math.min(0.42, node.intensity ?? 0.32)));
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, height * 0.42, width, height * 0.42);
  }
  if (node.effect === "rain") {
    const density = Math.max(0.2, Math.min(1.6, node.density ?? node.intensity ?? 0.72));
    const intensity = Math.max(0.1, Math.min(1.4, node.intensity ?? 0.4));
    const color = node.color ?? "#bcd7ff";
    const mist = context.createLinearGradient(0, height * 0.24, 0, height * 0.78);
    mist.addColorStop(0, toAlphaColor(color, node.mist === false ? 0 : 0.02 * intensity));
    mist.addColorStop(0.62, toAlphaColor(color, node.mist === false ? 0 : 0.09 * intensity));
    mist.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = mist;
    context.fillRect(0, height * 0.2, width, height * 0.72);
    const drawLayer = (count: number, length: number, alpha: number, lineWidth: number, speed: number, spread: number) => {
      context.strokeStyle = toAlphaColor(color, alpha);
      context.lineWidth = lineWidth;
      for (let i = 0; i < count; i += 1) {
        const x = (i * 47 + time * 0.045 * speed + spread) % width;
        const y = (i * 89 + time * 0.22 * speed) % (height * 0.82);
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x - length * 0.27, y + length);
        context.stroke();
      }
    };
    drawLayer(Math.round(80 * density), 24, Math.min(0.24, intensity * 0.18), 1, 0.65, 11);
    drawLayer(Math.round(58 * density), 38, Math.min(0.42, intensity * 0.28), 1.2, 0.95, 37);
    drawLayer(Math.round(34 * density), 58, Math.min(0.62, intensity * 0.38), 1.6, 1.28, 73);
    if (node.splashes !== false) {
      context.strokeStyle = toAlphaColor(color, Math.min(0.32, intensity * 0.24));
      context.lineWidth = 1;
      for (let i = 0; i < Math.round(36 * density); i += 1) {
        const x = ((i * 83) % 100) / 100 * width;
        const y = height * (0.64 + ((i * 41) % 28) / 100);
        const radius = 3 + ((i * 17) % 8);
        context.beginPath();
        context.ellipse(x, y, radius * 1.9, radius * 0.42, 0, 0, Math.PI * 2);
        context.stroke();
      }
    }
  }
  if (node.effect === "snow") {
    const density = Math.max(0.2, Math.min(1.6, node.density ?? node.intensity ?? 0.68));
    const intensity = Math.max(0.1, Math.min(1.4, node.intensity ?? 0.4));
    const color = node.color ?? "#e8f1ff";
    if (node.mist !== false) {
      context.fillStyle = toAlphaColor(color, Math.min(0.1, 0.03 + intensity * 0.04));
      context.fillRect(0, height * 0.2, width, height * 0.72);
    }
    const drift = (node.wind?.[0] ?? -0.85) * 0.02;
    for (let layer = 0; layer < 3; layer += 1) {
      const count = Math.round((layer === 2 ? 30 : 52) * density);
      const size = layer === 2 ? 3.1 : layer === 1 ? 2.2 : 1.4;
      context.fillStyle = toAlphaColor(color, Math.min(0.85, 0.34 + intensity * (0.3 - layer * 0.06)));
      for (let i = 0; i < count; i += 1) {
        const sway = Math.sin(time * 0.0011 * (node.speed ?? 1) + i * 1.7 + layer) * (6 + layer * 5);
        const x = (((i * 61 + layer * 197 + time * 0.008 * (node.speed ?? 1) * drift * 60) % width) + width) % width + sway * 0.14;
        const y = ((i * 97 + layer * 131 + time * 0.028 * (node.speed ?? 1) * (1 + layer * 0.3)) % (height * 0.86)) + height * 0.06;
        context.beginPath();
        context.arc(x, y, size, 0, Math.PI * 2);
        context.fill();
      }
    }
  }
  if (node.effect === "particles") {
    const isFountain = node.emitter === "fountain";
    // Fountain cap matches prefabs.particleFountain's 2400 maximum so rendered counts never undercut the scene JSON.
    const count = Math.max(120, Math.min(isFountain ? 2400 : 1600, node.particleCount ?? 900));
    const radius = Math.max(0.1, node.radius ?? 1.15);
    const height3d = Math.max(0.2, node.height ?? 2.4);
    const color = String(node.color ?? "#7dfcff");
    const intensity = Math.max(0.1, Math.min(1.1, node.intensity ?? 0.8));
    const seconds = time / 1000 * (node.speed ?? 1);
    if (isFountain) {
      const baseX = width * 0.5;
      const baseY = height * 0.68;
      const fountainName = node.name ?? "";
      const mistLayer = node.mist !== false && (fountainName.includes("mist") || node.materialMode === "soft-alpha");
      const splashLayer = fountainName.includes("splash") || node.materialMode === "splash";
      if (node.mist !== false) {
        const mist = context.createRadialGradient(baseX, baseY - height * 0.28, width * 0.04, baseX, baseY - height * 0.08, width * 0.34);
        mist.addColorStop(0, toAlphaColor("#e0f7ff", Math.min(0.11, intensity * 0.1)));
        mist.addColorStop(0.48, toAlphaColor("#bae6fd", Math.min(0.07, intensity * 0.07)));
        mist.addColorStop(1, "rgba(255,255,255,0)");
        context.fillStyle = mist;
        context.fillRect(baseX - width * 0.38, baseY - height * 0.56, width * 0.76, height * 0.56);
      }
      if (fountainName.includes("plume")) {
        const basin = context.createRadialGradient(baseX, baseY + 6, width * 0.03, baseX, baseY + 8, width * 0.22);
        basin.addColorStop(0, "rgba(224,247,255,0.34)");
        basin.addColorStop(0.48, "rgba(14,165,233,0.22)");
        basin.addColorStop(1, "rgba(2,8,23,0)");
        context.fillStyle = basin;
        context.beginPath();
        context.ellipse(baseX, baseY + 10, width * 0.22, height * 0.045, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "rgba(15,23,42,0.86)";
        context.beginPath();
        context.ellipse(baseX, baseY + 9, width * 0.08, height * 0.018, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "rgba(56,189,248,0.42)";
        context.beginPath();
        context.ellipse(baseX, baseY + 5, width * 0.052, height * 0.012, 0, 0, Math.PI * 2);
        context.fill();
      }
      context.lineCap = "round";
      context.lineJoin = "round";
      const fountainPalette = ["#fff7ad", "#fef08a", "#fb923c", "#60a5fa", "#38bdf8", "#fb7185"];
      for (let index = 0; index < count; index += 1) {
        const position = new Float32Array(3);
        writeParticlePosition(position, 0, seconds, "fountain", radius, height3d, index, node.turbulence ?? node.noise ?? 0, node.gravity ?? 0, node.groundCollision ?? false, mistLayer ? "mist" : splashLayer ? "splash" : "plume");
        const jitterX = seededRange(index, 251, -radius, radius) * (mistLayer ? 0.32 : 0.08);
        const jitterZ = seededRange(index, 257, -radius, radius);
        const x = baseX + (position[0] + jitterX) * width * (mistLayer ? 0.075 : 0.095);
        const y = baseY - position[1] * height * 0.16 + jitterZ * height * (mistLayer ? 0.014 : 0.01);
        const life = getParticleLife(index, seconds, "fountain");
        const paletteColor = fountainPalette[index % fountainPalette.length] ?? color;
        const nearGround = position[1] < 0.62;
        const size = mistLayer ? seededRange(index, 263, 1.8, 4.8) : seededRange(index, 263, 3.2, 6.4);
        const outward = position[0] === 0 ? seededRange(index, 269, -1, 1) : Math.sign(position[0]);
        const fade = 1 - Math.max(0, life - 0.82) * 2.2;
        const alpha = Math.max(0.08, Math.min(mistLayer ? 0.2 : 0.82, (mistLayer ? 0.08 + intensity * 0.1 : nearGround || splashLayer ? 0.34 + intensity * 0.24 : 0.46 + intensity * 0.26) * fade));
        if (mistLayer) {
          context.fillStyle = toAlphaColor(paletteColor, alpha);
          context.beginPath();
          context.ellipse(x, y, size * 1.9, size * 0.7, outward * 0.18, 0, Math.PI * 2);
          context.fill();
          continue;
        }
        context.fillStyle = toAlphaColor(paletteColor, alpha);
        context.beginPath();
        context.arc(x, y, nearGround || splashLayer ? size * 0.72 : size, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "rgba(255,255,255,0.28)";
        context.beginPath();
        context.arc(x - size * 0.24, y - size * 0.24, Math.max(0.8, size * 0.22), 0, Math.PI * 2);
        context.fill();
        if (nearGround && node.splashes !== false && index % 9 === 0) {
          context.strokeStyle = "rgba(248,253,255,0.18)";
          context.lineWidth = 1;
          context.beginPath();
          context.ellipse(x, baseY + seededRange(index, 271, 3, 18), size * 2.7, size * 0.56, 0, 0, Math.PI * 2);
          context.stroke();
        }
      }
    } else {
      context.fillStyle = toAlphaColor(color, Math.min(0.9, 0.38 + intensity * 0.22));
      for (let index = 0; index < count; index += 1) {
        const position = new Float32Array(3);
        writeParticlePosition(position, 0, seconds, node.emitter ?? "swirl", radius, height3d, index);
        const jitterX = seededRange(index, 251, -radius, radius);
        const jitterZ = seededRange(index, 257, -radius, radius);
        const x = width * 0.5 + (position[0] + jitterX * 0.18) * width * 0.09;
        const y = height * 0.68 - position[1] * height * 0.16 + jitterZ * height * 0.02;
        const size = seededRange(index, 263, 1.1, 2.9);
        context.fillRect(x, y, size, size);
      }
    }
  }
  context.restore();
}

export function shouldRenderOverlay(diagnostics: AuraCreateAppOptions["diagnostics"], snapshot: AuraSceneSnapshot): boolean {
  if (typeof diagnostics === "boolean") return diagnostics;
  if (diagnostics?.overlay || diagnostics?.assetPanel || diagnostics?.performancePanel) return true;
  return snapshot.diagnostics.enabled;
}

export function createDiagnosticsOverlay(canvas: HTMLCanvasElement, diagnosticsState: MutableDiagnostics): { update(): void; dispose(): void } {
  const parent = canvas.parentElement ?? document.body;
  const overlay = document.createElement("div");
  overlay.className = "aura-diagnostics-overlay";
  overlay.style.cssText = [
    "position:absolute",
    "right:12px",
    "top:12px",
    "z-index:10",
    "font:12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
    "color:#ecf7ff",
    "background:rgba(6,10,18,0.82)",
    "border:1px solid rgba(146,176,210,0.36)",
    "border-radius:8px",
    "padding:10px 12px",
    "min-width:190px",
    "pointer-events:none"
  ].join(";");
  const computed = getComputedStyle(parent);
  if (computed.position === "static") parent.style.position = "relative";
  parent.append(overlay);
  const update = () => {
    const diagnostics = snapshotDiagnostics(diagnosticsState);
    const rendererDiagnostics = diagnostics.renderer;
    overlay.innerHTML = [
      `<b>Aura3D diagnostics</b>`,
      `<div>backend: ${escapeHtml(diagnostics.backend)}</div>`,
      `<div>fps: ${diagnostics.fps}</div>`,
      `<div>draw calls: ${diagnostics.drawCalls}</div>`,
      `<div>render size: ${diagnostics.renderSize[0]} x ${diagnostics.renderSize[1]}</div>`,
      rendererDiagnostics ? `<div>tone: ${rendererDiagnostics.toneMapping} @ ${rendererDiagnostics.exposure.exposure}</div>` : "",
      rendererDiagnostics ? `<div>bloom: ${rendererDiagnostics.bloom.enabled ? `${rendererDiagnostics.bloom.intensity}/${rendererDiagnostics.bloom.threshold} ${rendererDiagnostics.bloom.rendered ? "rendered" : "requested"}` : "off"}</div>` : "",
      rendererDiagnostics ? `<div>post: ${rendererDiagnostics.postprocess.runtimeStatus} ${rendererDiagnostics.postprocess.actualPasses.join("+") || rendererDiagnostics.postprocess.requestedPasses.join("+") || "none"}</div>` : "",
      rendererDiagnostics ? `<div>shadows: ${rendererDiagnostics.shadows.contactShadows} contact, ${rendererDiagnostics.shadows.mapType}</div>` : "",
      rendererDiagnostics ? `<div>environment: ${rendererDiagnostics.environment.preset ?? "fallback"}</div>` : "",
      `<div>assets: ${diagnostics.assets.map((asset) => `${asset.id}:${asset.status}`).join(", ") || "none"}</div>`,
      diagnostics.warnings.length ? `<div>warnings: ${diagnostics.warnings.length}</div>` : ""
    ].join("");
  };
  update();
  return {
    update,
    dispose() {
      overlay.remove();
    }
  };
}

function shadeColor(color: string, amount: number): string {
  if (!color.startsWith("#") || color.length < 7) return color;
  const value = Number.parseInt(color.slice(1, 7), 16);
  const red = clampChannel((value >> 16) + amount);
  const green = clampChannel(((value >> 8) & 0xff) + amount);
  const blue = clampChannel((value & 0xff) + amount);
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function toAlphaColor(color: string, alpha: number): string {
  if (!color.startsWith("#") || color.length < 7) return `rgba(255,255,255,${alpha})`;
  const value = Number.parseInt(color.slice(1, 7), 16);
  return `rgba(${value >> 16},${(value >> 8) & 0xff},${value & 0xff},${alpha})`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
