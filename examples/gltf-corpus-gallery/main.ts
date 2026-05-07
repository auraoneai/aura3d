import { createGLTFCorpusReport, type GLTFCorpusManifest, type GLTFCorpusReport } from "@galileo3d/assets";
import { createExample, drawGrid, installExampleStyles, type ExampleMetadata } from "../shared/exampleHarness.js";

const metadata: ExampleMetadata = {
  id: "gltf-corpus-gallery",
  title: "glTF Corpus Gallery",
  purpose: "Visualize the pinned external glTF corpus with pass, warning, and expected-fail classifications.",
  acceptance: "The pinned manifest is rendered with classified corpus cards and summary counts.",
};

interface GalleryState {
  readonly status: "ready" | "error";
  readonly assetCount: number;
  readonly pass: number;
  readonly warn: number;
  readonly expectedFail: number;
  readonly sourceRevision: string;
  readonly renderedCards: number;
  readonly error?: string;
}

declare global {
  interface Window {
    __GALILEO3D_GLTF_CORPUS_GALLERY__?: GalleryState;
  }
}

if (typeof document !== "undefined") {
  installExampleStyles();
  void createExample(metadata, async () => {
    const manifest = await loadManifest();
    const report = createGLTFCorpusReport(manifest, "2026-05-06T00:00:00.000Z");
    const galleryState = summarize(report);
    window.__GALILEO3D_GLTF_CORPUS_GALLERY__ = galleryState;

    return {
      metrics: {
        assetCount: galleryState.assetCount,
        pass: galleryState.pass,
        warn: galleryState.warn,
        expectedFail: galleryState.expectedFail,
        sourceRevision: galleryState.sourceRevision,
      },
      draw(context, canvas) {
        drawCorpusGallery(context, canvas, report);
      },
    };
  }).catch((error) => {
    window.__GALILEO3D_GLTF_CORPUS_GALLERY__ = {
      status: "error",
      assetCount: 0,
      pass: 0,
      warn: 0,
      expectedFail: 0,
      sourceRevision: "",
      renderedCards: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  });
}

async function loadManifest(): Promise<GLTFCorpusManifest> {
  const response = await fetch("../../tests/assets/corpus/gltf-corpus.manifest.json");
  if (!response.ok) {
    throw new Error(`glTF corpus manifest request failed with ${response.status}`);
  }
  return await response.json() as GLTFCorpusManifest;
}

function summarize(report: GLTFCorpusReport): GalleryState {
  return {
    status: "ready",
    assetCount: report.sourceManifest.assetCount,
    pass: report.summary.pass,
    warn: report.summary.warn,
    expectedFail: report.summary.expectedFail,
    sourceRevision: report.sourceManifest.sourceRevision,
    renderedCards: report.assets.length,
  };
}

function drawCorpusGallery(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, report: GLTFCorpusReport): void {
  drawGrid(context, canvas, 48);
  context.save();

  context.fillStyle = "#eef2f6";
  context.font = "28px ui-sans-serif, system-ui, sans-serif";
  context.fillText("Pinned glTF Corpus", 36, 52);
  context.font = "14px ui-sans-serif, system-ui, sans-serif";
  context.fillStyle = "#b7c4ce";
  context.fillText(`${report.sourceManifest.assetCount} assets from ${report.sourceManifest.sourceRevision.slice(0, 12)}`, 38, 80);

  drawSummaryPill(context, 610, 34, "#62d68f", `${report.summary.pass} pass`);
  drawSummaryPill(context, 720, 34, "#e6c84d", `${report.summary.warn} warn`);
  drawSummaryPill(context, 830, 34, "#ff7b6b", `${report.summary.expectedFail} expected fail`);

  const columns = 4;
  const cardWidth = 210;
  const cardHeight = 118;
  const gap = 18;
  const startX = 36;
  const startY = 112;

  report.assets.forEach((asset, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = startX + column * (cardWidth + gap);
    const y = startY + row * (cardHeight + gap);
    drawAssetCard(context, x, y, cardWidth, cardHeight, asset);
  });

  context.restore();
}

function drawSummaryPill(context: CanvasRenderingContext2D, x: number, y: number, color: string, text: string): void {
  context.fillStyle = "#17212a";
  context.strokeStyle = color;
  context.lineWidth = 2;
  roundedRect(context, x, y, 96, 34, 6);
  context.fill();
  context.stroke();
  context.fillStyle = color;
  context.font = "13px ui-sans-serif, system-ui, sans-serif";
  context.fillText(text, x + 12, y + 22);
}

function drawAssetCard(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  asset: GLTFCorpusReport["assets"][number],
): void {
  const color = asset.expectedStatus === "pass" ? "#62d68f" : asset.expectedStatus === "warn" ? "#e6c84d" : "#ff7b6b";
  context.fillStyle = "#151d24";
  context.strokeStyle = "#34424d";
  context.lineWidth = 1;
  roundedRect(context, x, y, width, height, 8);
  context.fill();
  context.stroke();

  context.fillStyle = color;
  context.fillRect(x, y, 6, height);
  context.fillStyle = "#eef2f6";
  context.font = "15px ui-sans-serif, system-ui, sans-serif";
  context.fillText(trimText(asset.name, 22), x + 18, y + 28);

  context.fillStyle = "#9fb0bd";
  context.font = "12px ui-sans-serif, system-ui, sans-serif";
  context.fillText(asset.format.toUpperCase(), x + 18, y + 52);
  context.fillText(asset.expectedStatus, x + 72, y + 52);

  context.fillStyle = "#26343f";
  context.fillRect(x + 18, y + 70, width - 36, 8);
  context.fillStyle = color;
  context.fillRect(x + 18, y + 70, Math.max(34, (width - 36) * statusWeight(asset.expectedStatus)), 8);

  context.fillStyle = "#b7c4ce";
  context.fillText(trimText(asset.tags.join(", "), 28), x + 18, y + 101);
}

function statusWeight(status: string): number {
  if (status === "pass") return 0.94;
  if (status === "warn") return 0.62;
  return 0.38;
}

function trimText(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}...`;
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}
