/**
 * compile-episode-document.ts — assembles a first-draft EpisodeDocument from a scene input
 * via the deterministic Director heuristics. The creator's existing coding agent then
 * REFINES it through the validated scene-tool CLI (`scripts/animation-scene.ts`) — there is no
 * separately-wired LLM here; the director is the agent the creator is already in.
 */

import { directScene, type DirectorSceneInput } from "./director-heuristics";
import {
  validateEpisodeDocumentShape,
  type CharacterAsset,
  type DocumentValidationResult,
  type EpisodeDocument,
  type PropAsset,
  type SetSpec
} from "../episode-document";

export interface CompileInput {
  readonly id: string;
  readonly duration: number;
  readonly assets: { readonly characters: readonly CharacterAsset[]; readonly props: readonly PropAsset[] };
  readonly set: SetSpec;
  readonly scene: DirectorSceneInput;
}

export interface CompileResult {
  readonly document: EpisodeDocument;
  readonly validation: DocumentValidationResult;
}

export function compileEpisodeDocument(input: CompileInput): CompileResult {
  const directed = directScene(input.id, input.scene);
  const document: EpisodeDocument = {
    id: input.id,
    duration: input.duration,
    assets: { characters: [...input.assets.characters], props: [...input.assets.props] },
    set: input.set,
    walkableBounds: input.scene.walkableBounds,
    shots: directed.shots,
    blocking: directed.blocking,
    setDressing: directed.setDressing,
    worldState: directed.worldState
  };
  return { document, validation: validateEpisodeDocumentShape(document) };
}
