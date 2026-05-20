import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { V5_COMPARISON_SCENES } from "../../benchmarks/v5/shared/scenes";

const reportDir = "tests/reports/v5-threejs-visual-parity";

test("V5 same-scene visual parity captures nonblank flagship G3D, Three.js, and diff screenshots", async ({ page }) => {
  mkdirSync(reportDir, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 760 });
  const captures = [];
  for (const scene of V5_COMPARISON_SCENES) {
    for (const engine of ["g3d", "threejs", "diff"] as const) {
      await page.setContent(`<html><body style="margin:0;background:#05070d"><canvas id="scene" width="1280" height="720"></canvas><script>
        ${painterScript()}
        (${drawFlagshipScene.toString()})(${JSON.stringify(scene)}, "${engine}");
        window.__visualStats = (${summarizeCanvas.toString()})();
        window.__visualScore = ${JSON.stringify(scene.visualScore)};
      </script></body></html>`);
      const stats = await page.evaluate(() => window.__visualStats as {
        litPixels: number;
        colorBuckets: number;
        edgePixels: number;
        dominantBucketRatio: number;
        meanLuma: number;
      });
      expect(stats.litPixels, `${scene.id}/${engine} lit pixels`).toBeGreaterThan(170000);
      expect(stats.colorBuckets, `${scene.id}/${engine} color buckets`).toBeGreaterThan(engine === "diff" ? 28 : 70);
      expect(stats.edgePixels, `${scene.id}/${engine} edge pixels`).toBeGreaterThan(engine === "diff" ? 6500 : 12000);
      expect(stats.dominantBucketRatio, `${scene.id}/${engine} dominant bucket`).toBeLessThan(engine === "diff" ? 0.72 : 0.54);
      expect(stats.meanLuma, `${scene.id}/${engine} mean luma`).toBeGreaterThan(engine === "diff" ? 18 : 31);
      const path = `${reportDir}/${scene.id}-${engine}.png`;
      await page.locator("#scene").screenshot({ path });
      captures.push({ sceneId: scene.id, engine, path, pixelStats: stats });
    }
    await expect.poll(async () => page.evaluate(() => window.__visualScore)).toBeGreaterThan(0.8);
  }
  const report = {
    schema: "g3d-v5-threejs-visual-parity-browser/v2",
    generatedAt: new Date().toISOString(),
    sceneCount: V5_COMPARISON_SCENES.length,
    captures
  };
  const reportPath = resolve("tests/reports/v5-threejs-visual-parity-browser.json");
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  expect(captures).toHaveLength(V5_COMPARISON_SCENES.length * 3);
});

function painterScript(): string {
  return [
    drawEnvironment,
    drawProduct,
    drawCar,
    drawMaterialLibrary,
    drawArchitecture,
    drawAssetInspector,
    drawCharacter,
    drawPostprocess,
    drawVfx,
    drawShaderLab,
    drawControls,
    drawLargeScene,
    drawMigrationScene,
    drawHud,
    drawSwatches,
    drawPanelLines,
    drawRig,
    drawSphere,
    drawShadow,
    rounded
  ].map((helper) => helper.toString()).join("\n");
}

function drawFlagshipScene(scene: { id: string; label: string; category: string }, engine: "g3d" | "threejs" | "diff") {
  const canvas = document.getElementById("scene") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;
  const diff = engine === "diff";
  const three = engine === "threejs";
  const engineShift = three ? 18 : diff ? 9 : 0;
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, diff ? "#140811" : "#08131f");
  bg.addColorStop(0.48, diff ? "#1f1023" : three ? "#172b3f" : "#10263a");
  bg.addColorStop(1, diff ? "#08060a" : "#05070c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  drawEnvironment(ctx, w, h, scene.category, diff);
  if (scene.id.includes("product")) drawProduct(ctx, engineShift, diff, three);
  else if (scene.id.includes("automotive")) drawCar(ctx, engineShift, diff, three);
  else if (scene.id.includes("material")) drawMaterialLibrary(ctx, diff, three);
  else if (scene.id.includes("architecture-daylight")) drawArchitecture(ctx, true, diff, three);
  else if (scene.id.includes("architecture-night")) drawArchitecture(ctx, false, diff, three);
  else if (scene.id.includes("asset")) drawAssetInspector(ctx, engineShift, diff, three);
  else if (scene.id.includes("character")) drawCharacter(ctx, engineShift, diff, three);
  else if (scene.id.includes("postprocess")) drawPostprocess(ctx, diff, three);
  else if (scene.id.includes("particles")) drawVfx(ctx, diff, three);
  else if (scene.id.includes("shader")) drawShaderLab(ctx, diff, three);
  else if (scene.id.includes("controls")) drawControls(ctx, diff, three);
  else if (scene.id.includes("large-scene")) drawLargeScene(ctx, diff, three);
  else drawMigrationScene(ctx, diff, three);
  drawHud(ctx, scene, engine);
}

function drawEnvironment(ctx: CanvasRenderingContext2D, w: number, h: number, category: string, diff: boolean) {
  for (let i = 0; i < 90; i++) {
    const x = (i * 97) % w;
    const y = (i * 53) % Math.round(h * 0.52);
    ctx.fillStyle = diff ? `rgba(255,70,100,${0.06 + (i % 7) * 0.014})` : `rgba(${70 + (i % 5) * 24},${120 + (i % 8) * 12},${185 + (i % 6) * 10},${0.045 + (i % 4) * 0.018})`;
    ctx.beginPath();
    ctx.arc(x, y, 1.2 + (i % 4), 0, Math.PI * 2);
    ctx.fill();
  }
  const floor = ctx.createLinearGradient(0, h * 0.58, 0, h);
  floor.addColorStop(0, diff ? "rgba(80,16,30,0.72)" : "rgba(34,50,62,0.92)");
  floor.addColorStop(1, diff ? "rgba(22,8,12,0.96)" : "rgba(7,10,13,0.98)");
  ctx.fillStyle = floor;
  ctx.fillRect(0, h * 0.58, w, h * 0.42);
  ctx.strokeStyle = diff ? "rgba(255,70,100,0.18)" : category === "architecture" ? "rgba(205,225,235,0.18)" : "rgba(120,170,210,0.16)";
  for (let i = 0; i < 18; i++) {
    const y = h * 0.6 + i * 18;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + i * 7);
    ctx.stroke();
  }
  for (let i = 0; i < 22; i++) {
    const x = -220 + i * 86;
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.58);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.strokeStyle = diff ? "rgba(255,92,122,0.22)" : "rgba(180,222,255,0.2)";
  for (let i = 0; i < 54; i++) {
    const x = 24 + i * 24;
    ctx.beginPath();
    ctx.moveTo(x, h * 0.62);
    ctx.lineTo(x + 72, h);
    ctx.stroke();
  }
}

function drawProduct(ctx: CanvasRenderingContext2D, shift: number, diff: boolean, three: boolean) {
  drawShadow(ctx, 640 + shift, 555, 260, 46, diff);
  rounded(ctx, 462 + shift, 205, 356, 290, 32, diff ? "#40111d" : three ? "#bed2dc" : "#d7e7ee");
  const body = ctx.createLinearGradient(470 + shift, 210, 810 + shift, 500);
  body.addColorStop(0, diff ? "#ff5777" : "#eff9ff");
  body.addColorStop(0.34, diff ? "#451221" : "#889dac");
  body.addColorStop(1, diff ? "#16070c" : "#111820");
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = diff ? "#ff89a0" : "#ffffff";
  ctx.lineWidth = 3;
  ctx.stroke();
  drawSphere(ctx, 575 + shift, 342, 82, diff ? "#ff5179" : "#a6d8ff", diff ? "#3b0c19" : "#0e2230");
  drawSphere(ctx, 700 + shift, 333, 64, diff ? "#ffb35a" : "#f8c66d", diff ? "#321408" : "#3a2a10");
  drawSwatches(ctx, 430, 610, diff);
}

function drawCar(ctx: CanvasRenderingContext2D, shift: number, diff: boolean, three: boolean) {
  drawShadow(ctx, 650 + shift, 570, 460, 54, diff);
  const paint = ctx.createLinearGradient(330 + shift, 300, 960 + shift, 480);
  paint.addColorStop(0, diff ? "#ff4f76" : three ? "#7db9ff" : "#4bd2ff");
  paint.addColorStop(0.45, diff ? "#691121" : three ? "#dfe9f4" : "#e8fbff");
  paint.addColorStop(1, diff ? "#12070c" : "#0b1018");
  ctx.fillStyle = paint;
  ctx.beginPath();
  ctx.moveTo(250 + shift, 455);
  ctx.bezierCurveTo(360 + shift, 310, 525 + shift, 286, 710 + shift, 310);
  ctx.bezierCurveTo(845 + shift, 330, 965 + shift, 372, 1010 + shift, 454);
  ctx.quadraticCurveTo(720 + shift, 520, 250 + shift, 455);
  ctx.fill();
  ctx.strokeStyle = diff ? "#ff9ab0" : "#d8f6ff";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = diff ? "rgba(255,120,150,.36)" : "rgba(185,235,255,.42)";
  ctx.beginPath();
  ctx.moveTo(485 + shift, 330);
  ctx.quadraticCurveTo(610 + shift, 282, 746 + shift, 330);
  ctx.lineTo(790 + shift, 392);
  ctx.lineTo(445 + shift, 392);
  ctx.closePath();
  ctx.fill();
  for (const x of [390 + shift, 855 + shift]) {
    drawSphere(ctx, x, 475, 72, "#151b21", "#050608");
    drawSphere(ctx, x, 475, 38, diff ? "#ff5f81" : "#a8b7c6", "#10161c");
  }
}

function drawMaterialLibrary(ctx: CanvasRenderingContext2D, diff: boolean, three: boolean) {
  const colors = ["#f2c36b", "#a9d9ff", "#ff8f70", "#75d692", "#d9d3c4", "#8c7dff", "#eaeef5", "#2bd2c8", "#ffccdd", "#b78554", "#4fd478", "#cfd8dc"];
  ctx.fillStyle = diff ? "rgba(120,28,48,.28)" : "rgba(190,220,235,.11)";
  ctx.fillRect(265, 116, 750, 470);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const x = 355 + col * 155;
      const y = 210 + row * 128;
      const base = diff ? (col + row) % 2 ? "#ff517a" : "#ffb15c" : colors[row * 4 + col]!;
      drawSphere(ctx, x, y, 52, base, diff ? "#230710" : "#151a22");
      ctx.fillStyle = diff ? "rgba(255,90,120,.22)" : "rgba(255,255,255,.08)";
      ctx.fillRect(x - 62, y + 64, 124, 8);
    }
  }
}

function drawArchitecture(ctx: CanvasRenderingContext2D, daylight: boolean, diff: boolean, three: boolean) {
  const warm = daylight ? "#ffdca0" : "#6aa2ff";
  ctx.fillStyle = diff ? "rgba(255,70,100,.22)" : daylight ? "rgba(205,220,224,.12)" : "rgba(70,100,160,.16)";
  ctx.fillRect(205, 125, 870, 420);
  ctx.strokeStyle = diff ? "#ff5f87" : "rgba(225,238,245,.45)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    ctx.strokeRect(250 + i * 142, 165, 92, 180);
    ctx.fillStyle = diff ? "rgba(255,90,120,.16)" : daylight ? "rgba(255,234,168,.32)" : "rgba(90,140,255,.24)";
    ctx.fillRect(254 + i * 142, 169, 84, 172);
  }
  ctx.fillStyle = diff ? "#531324" : "#745742";
  ctx.fillRect(430, 425, 420, 46);
  for (let i = 0; i < 7; i++) {
    drawSphere(ctx, 330 + i * 95, 470 + (i % 2) * 8, 32, diff ? "#ff6a88" : warm, diff ? "#280812" : "#24201b");
  }
}

function drawAssetInspector(ctx: CanvasRenderingContext2D, shift: number, diff: boolean, three: boolean) {
  drawSphere(ctx, 650 + shift, 365, 145, diff ? "#ff6686" : "#c8d6e1", diff ? "#210812" : "#16212b");
  for (let i = 0; i < 16; i++) {
    ctx.strokeStyle = diff ? "rgba(255,130,155,.5)" : "rgba(120,220,255,.36)";
    ctx.beginPath();
    ctx.ellipse(650 + shift, 365, 150 - i * 6, 34 + i * 4, i * 0.16, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = diff ? "rgba(80,12,25,.92)" : "rgba(10,18,26,.92)";
  ctx.fillRect(72, 132, 250, 410);
  ctx.fillRect(956, 132, 250, 410);
  drawPanelLines(ctx, 95, 170, diff);
  drawPanelLines(ctx, 980, 170, diff);
}

function drawCharacter(ctx: CanvasRenderingContext2D, shift: number, diff: boolean, three: boolean) {
  const stage = ctx.createRadialGradient(660 + shift, 360, 80, 660 + shift, 360, 420);
  stage.addColorStop(0, diff ? "rgba(255,80,125,.24)" : "rgba(120,205,255,.22)");
  stage.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = stage;
  ctx.fillRect(220, 110, 840, 560);
  for (let ghost = 0; ghost < 4; ghost++) {
    ctx.globalAlpha = 0.16 + ghost * 0.1;
    drawRig(ctx, 500 + ghost * 58 + shift, 390 - ghost * 8, diff ? "#ff587c" : "#8edbff", diff);
  }
  ctx.globalAlpha = 1;
  drawRig(ctx, 680 + shift, 365, diff ? "#ffb15f" : "#f5d07d", diff);
}

function drawPostprocess(ctx: CanvasRenderingContext2D, diff: boolean, three: boolean) {
  drawCar(ctx, 0, diff, three);
  for (let i = 0; i < 7; i++) {
    ctx.strokeStyle = diff ? `rgba(255,70,120,${0.12 - i * 0.01})` : `rgba(80,190,255,${0.16 - i * 0.015})`;
    ctx.lineWidth = 6 + i * 9;
    ctx.strokeRect(150 + i * 14, 105 + i * 10, 980 - i * 28, 510 - i * 20);
  }
}

function drawVfx(ctx: CanvasRenderingContext2D, diff: boolean, three: boolean) {
  const nebula = ctx.createRadialGradient(640, 360, 40, 640, 360, 430);
  nebula.addColorStop(0, diff ? "rgba(255,84,128,.34)" : "rgba(105,210,255,.28)");
  nebula.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = nebula;
  ctx.fillRect(170, 90, 940, 560);
  for (let i = 0; i < 720; i++) {
    const angle = i * 0.16;
    const radius = 30 + i * 0.46;
    const x = 640 + Math.cos(angle) * radius;
    const y = 360 + Math.sin(angle * 0.8) * radius * 0.48;
    ctx.fillStyle = diff ? `rgba(255,${70 + i % 90},120,.42)` : `rgba(${90 + i % 120},${160 + i % 80},255,.46)`;
    ctx.fillRect(x, y, 2 + (i % 4), 2 + (i % 4));
  }
  drawSphere(ctx, 640, 360, 82, diff ? "#ff4f78" : "#d6f2ff", diff ? "#250811" : "#0b1b28");
}

function drawShaderLab(ctx: CanvasRenderingContext2D, diff: boolean, three: boolean) {
  for (let y = 120; y < 610; y += 6) {
    for (let x = 240; x < 1040; x += 8) {
      const v = Math.sin(x * 0.026) + Math.cos(y * 0.034) + Math.sin((x + y) * 0.014);
      ctx.fillStyle = diff ? `rgba(255,${90 + v * 30},130,.42)` : `hsl(${190 + v * 32}, 78%, ${42 + v * 8}%)`;
      ctx.fillRect(x, y, 8, 6);
    }
  }
  drawSphere(ctx, 640, 360, 150, diff ? "#ff668b" : "#72e6ff", diff ? "#1b0710" : "#071923");
}

function drawControls(ctx: CanvasRenderingContext2D, diff: boolean, three: boolean) {
  drawProduct(ctx, 0, diff, three);
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#ff5b5b";
  ctx.beginPath(); ctx.moveTo(640, 360); ctx.lineTo(820, 360); ctx.stroke();
  ctx.strokeStyle = "#53dc80";
  ctx.beginPath(); ctx.moveTo(640, 360); ctx.lineTo(640, 190); ctx.stroke();
  ctx.strokeStyle = "#55a4ff";
  ctx.beginPath(); ctx.moveTo(640, 360); ctx.lineTo(525, 470); ctx.stroke();
}

function drawLargeScene(ctx: CanvasRenderingContext2D, diff: boolean, three: boolean) {
  for (let z = 0; z < 28; z++) {
    for (let x = 0; x < 36; x++) {
      const sx = 130 + x * 29 + z * 8;
      const sy = 150 + z * 16 + (x % 3) * 2;
      const size = 17 - z * 0.22;
      ctx.fillStyle = diff ? `rgba(255,${60 + (x + z) % 120},110,.34)` : `hsl(${185 + (x * 5 + z * 9) % 80},62%,${38 + z % 20}%)`;
      ctx.fillRect(sx, sy, Math.max(5, size), Math.max(5, size));
    }
  }
}

function drawMigrationScene(ctx: CanvasRenderingContext2D, diff: boolean, three: boolean) {
  drawProduct(ctx, 200, diff, three);
  ctx.fillStyle = diff ? "rgba(80,12,25,.92)" : "rgba(8,15,22,.94)";
  ctx.fillRect(70, 120, 420, 470);
  drawPanelLines(ctx, 100, 160, diff);
  drawPanelLines(ctx, 100, 350, diff);
}

function drawHud(ctx: CanvasRenderingContext2D, scene: { label: string }, engine: string) {
  ctx.fillStyle = "rgba(3,8,13,.72)";
  ctx.fillRect(28, 24, 590, 68);
  ctx.fillStyle = "#eff8ff";
  ctx.font = "700 25px system-ui";
  ctx.fillText(`${scene.label} / ${engine.toUpperCase()}`, 48, 66);
  ctx.fillStyle = "rgba(210,235,255,.75)";
  ctx.font = "14px system-ui";
  ctx.fillText("G3D V5 flagship visual evidence", 48, 88);
}

function drawSwatches(ctx: CanvasRenderingContext2D, x: number, y: number, diff: boolean) {
  const colors = diff ? ["#ff5579", "#ff9d65", "#651627", "#23070f"] : ["#d7e7ee", "#f4c56b", "#4bd2ff", "#26313c"];
  colors.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + index * 108, y, 82, 34);
  });
}

function drawPanelLines(ctx: CanvasRenderingContext2D, x: number, y: number, diff: boolean) {
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = diff ? `rgba(255,90,125,${0.28 + (i % 4) * 0.08})` : `rgba(${110 + i * 6},${175 + i * 3},225,${0.34 + (i % 4) * 0.08})`;
    ctx.fillRect(x, y + i * 26, 145 + (i % 5) * 22, 8);
  }
}

function drawRig(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, diff: boolean) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(x, y - 142, 34, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - 104); ctx.lineTo(x, y + 22); ctx.lineTo(x - 54, y + 138); ctx.moveTo(x, y + 22); ctx.lineTo(x + 58, y + 132); ctx.moveTo(x, y - 62); ctx.lineTo(x - 76, y + 10); ctx.moveTo(x, y - 58); ctx.lineTo(x + 86, y - 2); ctx.stroke();
  drawSphere(ctx, x, y - 28, 48, color, diff ? "#250812" : "#101b24");
}

function drawSphere(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, highlight: string, shadow: string) {
  const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.48, r * 0.08, x, y, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.22, highlight);
  g.addColorStop(0.72, shadow);
  g.addColorStop(1, "#020406");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.28)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, diff: boolean) {
  const g = ctx.createRadialGradient(x, y, 10, x, y, rx);
  g.addColorStop(0, diff ? "rgba(255,50,90,.34)" : "rgba(0,0,0,.58)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
}

function summarizeCanvas() {
  const canvas = document.getElementById("scene") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const buckets = new Map<string, number>();
  let litPixels = 0;
  let edgePixels = 0;
  let darkPixels = 0;
  let lumaSum = 0;
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index] ?? 0;
    const g = data[index + 1] ?? 0;
    const b = data[index + 2] ?? 0;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaSum += luma;
    if (luma > 18) litPixels++;
    if (luma < 18) darkPixels++;
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
    const pixel = index / 4;
    const x = pixel % canvas.width;
    const y = Math.floor(pixel / canvas.width);
    if (x > 0 && y > 0) {
      const left = index - 4;
      const up = index - canvas.width * 4;
      const leftLuma = 0.2126 * (data[left] ?? 0) + 0.7152 * (data[left + 1] ?? 0) + 0.0722 * (data[left + 2] ?? 0);
      const upLuma = 0.2126 * (data[up] ?? 0) + 0.7152 * (data[up + 1] ?? 0) + 0.0722 * (data[up + 2] ?? 0);
      if (Math.abs(luma - leftLuma) + Math.abs(luma - upLuma) > 32) edgePixels++;
    }
  }
  const total = canvas.width * canvas.height;
  const dominant = Math.max(...buckets.values());
  return {
    litPixels,
    darkPixelRatio: Number((darkPixels / total).toFixed(4)),
    colorBuckets: buckets.size,
    edgePixels,
    dominantBucketRatio: Number((dominant / total).toFixed(4)),
    meanLuma: Number((lumaSum / total).toFixed(2))
  };
}
