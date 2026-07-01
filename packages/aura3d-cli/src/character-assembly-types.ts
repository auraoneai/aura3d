import type { AuraCliAssetType } from "./asset-core-types.js";
import type { AuraCliHumanoidInspection } from "./asset-inspection-types.js";

export interface CharacterAssemblyPlanOptions {
  readonly projectDir?: string;
  readonly name: string;
  readonly body: string;
  readonly parts?: readonly CharacterAssemblyPartInput[];
  readonly scale?: number;
  readonly output?: string;
}

export interface CharacterAssemblyPartInput {
  readonly slot: string;
  readonly asset: string;
  readonly attachTo?: string;
}

export interface CharacterAssemblyPlanResult {
  readonly ok: boolean;
  readonly schema: "aura3d.character-assembly/1.0";
  readonly name: string;
  readonly output: string;
  readonly body: CharacterAssemblyResolvedPart;
  readonly parts: readonly CharacterAssemblyResolvedPart[];
  readonly validation: {
    readonly failures: readonly string[];
    readonly warnings: readonly string[];
  };
  readonly messages: readonly string[];
}

export interface CharacterAssemblyResolvedPart {
  readonly slot: string;
  readonly asset: string;
  readonly url: string;
  readonly type: AuraCliAssetType;
  readonly format: string;
  readonly animations: readonly string[];
  readonly humanoid?: AuraCliHumanoidInspection;
  readonly attachTo: string;
}
