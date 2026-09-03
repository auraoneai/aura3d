import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { SanitizedMeshyMetadata, SanitizedMeshyRightsEvidence } from "./metadata.js";

export interface RetainedMeshyEvidence {
  readonly metadataPath: string;
  readonly rightsPath: string;
}

export function retainMeshyEvidence(options: {
  readonly projectDir: string;
  readonly assetName: string;
  readonly metadata: SanitizedMeshyMetadata;
  readonly rights: SanitizedMeshyRightsEvidence;
}): RetainedMeshyEvidence {
  const directory = resolve(options.projectDir, "aura-evidence", "meshy");
  mkdirSync(directory, { recursive: true });
  const metadataPath = writeHashedJson(directory, options.assetName + ".metadata", {
    schema: "aura3d.meshy-metadata/1.0",
    metadata: options.metadata
  });
  const rightsPath = writeHashedJson(directory, options.assetName + ".rights", {
    schema: "aura3d.meshy-rights/1.0",
    rights: options.rights
  });
  return {
    metadataPath: normalized(relative(options.projectDir, metadataPath)),
    rightsPath: normalized(relative(options.projectDir, rightsPath))
  };
}

function writeHashedJson(directory: string, stem: string, value: unknown): string {
  const content = JSON.stringify(value, null, 2) + "\n";
  const hash = createHash("sha256").update(content).digest("hex");
  const path = resolve(directory, stem + "." + hash.slice(0, 12) + ".json");
  try {
    const existing = readFileSync(path, "utf8");
    if (existing !== content) throw new Error("Meshy evidence hash collision at " + path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    writeFileSync(path, content, { encoding: "utf8", mode: 0o644, flag: "wx" });
  }
  return path;
}

function normalized(path: string): string { return path.replaceAll("\\", "/"); }
