import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const marketingDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(marketingDir, "..");

const previews = [
  {
    id: "showcase-product-configurator",
    target: "marketing/public/previews/showcase/showcase-product-configurator.png"
  },
  {
    id: "showcase-smart-city-control",
    source: "tests/reports/production-catalog-audit/02-smart-city-control-room.png",
    target: "marketing/public/previews/showcase/showcase-smart-city-control-scene.png"
  },
  {
    id: "showcase-cinematic-architecture",
    target: "marketing/public/previews/showcase/showcase-cinematic-architecture.png"
  },
  {
    id: "showcase-digital-twin-ops",
    target: "marketing/public/previews/showcase/showcase-digital-twin-ops.png"
  },
  {
    id: "showcase-turbo-drift-circuit",
    source: "tests/reports/showcase-gameplay/showcase-turbo-drift-circuit-high-speed-chase.png",
    target: "marketing/public/previews/showcase/showcase-turbo-drift-circuit.png"
  },
  {
    id: "showcase-skyline-runner",
    source: "tests/reports/showcase-gameplay/showcase-skyline-runner-act-aurora-crown.png",
    target: "marketing/public/previews/showcase/showcase-skyline-runner.png"
  }
];

function inspectPng(path) {
  const bytes = readFileSync(path);
  const signature = bytes.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a" || bytes.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new Error(`Preview source is not a PNG: ${relative(repoRoot, path)}`);
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}

const manifest = {
  schema: "aura3d.marketing-final-previews/1.0",
  status: "machine-reviewed-human-approval-pending",
  approvalNote: "The August 12 approval predates subsequent game, lighting, and homepage changes. Exact final artifacts require renewed independent review.",
  generatedAt: new Date().toISOString(),
  previews: previews.map((preview) => {
    const sourcePath = preview.source ?? preview.target;
    const source = resolve(repoRoot, sourcePath);
    const target = resolve(repoRoot, preview.target);
    if (!existsSync(source)) throw new Error(`Missing preview evidence: ${sourcePath}`);
    const dimensions = inspectPng(source);
    if (dimensions.width < 1200 || dimensions.height < 700) {
      throw new Error(`Preview evidence is too small: ${sourcePath} (${dimensions.width}x${dimensions.height})`);
    }
    mkdirSync(dirname(target), { recursive: true });
    if (source !== target) copyFileSync(source, target);
    const targetDimensions = inspectPng(target);
    if (targetDimensions.sha256 !== dimensions.sha256) {
      throw new Error(`Copied preview hash mismatch: ${preview.target}`);
    }
    return {
      ...preview,
      source: sourcePath,
      ...dimensions,
      bytes: statSync(target).size
    };
  })
};

const manifestPath = resolve(marketingDir, "public/previews/final-preview-manifest.json");
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Synced ${manifest.previews.length} reviewed preview images.`);
for (const preview of manifest.previews) {
  console.log(`${preview.id}: ${preview.width}x${preview.height} sha256-${preview.sha256.slice(0, 12)}`);
}
