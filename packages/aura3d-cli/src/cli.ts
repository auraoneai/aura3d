#!/usr/bin/env node
import {
  addAsset,
  checkDeploy,
  createAssetThumbnails,
  doctor,
  initAgentFiles,
  listAssets,
  scanAssets,
  validateAssets,
  writeTypedAssets,
  readAssetManifest
} from "./index.js";

const args = process.argv.slice(2);

try {
  const command = args[0];
  if (command === "assets") {
    const action = args[1];
    if (action === "add") {
      const file = args[2];
      const name = readOption("--name");
      if (!file || !name) throw new Error("Usage: aura3d assets add ./model.glb --name robot");
      print(addAsset({ file, name, publicPath: readOption("--public-path"), outputDir: readOption("--output") }));
    } else if (action === "scan") {
      print(scanAssets({ directory: args[2] ?? "assets" }));
    } else if (action === "validate") {
      print(validateAssets());
    } else if (action === "list") {
      console.log(JSON.stringify(listAssets(), null, 2));
    } else if (action === "typegen") {
      const path = writeTypedAssets(process.cwd(), readAssetManifest(process.cwd()));
      console.log(`Wrote ${path}`);
    } else if (action === "thumbnail") {
      print(createAssetThumbnails());
    } else if (action === "serve") {
      const manifest = readAssetManifest(process.cwd());
      console.log(`Serve ${manifest.outputDir} at ${manifest.assetBasePath}`);
    } else {
      throw new Error(`Unknown assets command: ${String(action)}`);
    }
  } else if (command === "doctor") {
    print(doctor());
  } else if (command === "check-deploy") {
    print(checkDeploy({ distDir: readOption("--dist") }));
  } else if (command === "init") {
    const agent = readOption("--agent") ?? "generic";
    if (!["claude", "cursor", "copilot", "generic", "all"].includes(agent)) throw new Error(`Unsupported agent target: ${agent}`);
    console.log(JSON.stringify({ written: initAgentFiles({ agent: agent as "claude" | "cursor" | "copilot" | "generic" | "all" }) }, null, 2));
  } else {
    console.log(`Aura3D CLI

Commands:
  aura3d assets add ./model.glb --name robot
  aura3d assets scan ./assets
  aura3d assets validate
  aura3d assets list
  aura3d assets typegen
  aura3d assets thumbnail
  aura3d doctor
  aura3d check-deploy --dist dist
  aura3d init --agent all`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function readOption(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function print(value: { readonly ok: boolean; readonly messages: readonly string[]; readonly failures?: readonly string[]; readonly warnings?: readonly string[] }): void {
  console.log(JSON.stringify(value, null, 2));
  if (!value.ok) process.exitCode = 1;
}
