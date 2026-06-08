/**
 * scene-tool-registry.ts — the constrained tool surface the studio agent calls.
 *
 * Every tool mutates the versioned document via the store, which validates + commits (or
 * rejects). The agent has scene-authoring powers, NOT arbitrary-code powers. `toolSchemas`
 * is the declarative surface an LLM is given for tool-calling.
 */

import type { CameraPresetId } from "@aura3d/engine";
import type { BlockingWaypoint, EpisodeDocument, PropPlacement, Vec3 } from "../episode-document";
import { EpisodeDocumentStore, type CommitResult } from "./episode-document-store";
import { clearProps, placeProp, setBlocking, setCamera, setGesture } from "./scene-tools";

export interface ToolSchema {
  readonly name: string;
  readonly description: string;
  readonly params: Record<string, string>;
}

export class SceneToolRegistry {
  constructor(private readonly store: EpisodeDocumentStore) {}

  document(): EpisodeDocument {
    return this.store.current();
  }

  block(characterId: string, shotId: string, waypoints: readonly BlockingWaypoint[], clip?: string): CommitResult {
    return this.store.commit(setBlocking(this.store.current(), characterId, shotId, waypoints, clip));
  }

  gesture(characterId: string, shotId: string, clip: string): CommitResult {
    return this.store.commit(setGesture(this.store.current(), characterId, shotId, clip));
  }

  camera(shotId: string, opts: { preset?: CameraPresetId; subject?: Vec3 }): CommitResult {
    return this.store.commit(setCamera(this.store.current(), shotId, opts));
  }

  dress(placement: PropPlacement): CommitResult {
    return this.store.commit(placeProp(this.store.current(), placement));
  }

  clearProps(propId?: string): CommitResult {
    return this.store.commit(clearProps(this.store.current(), propId));
  }

  undo(): boolean {
    return this.store.undo();
  }

  redo(): boolean {
    return this.store.redo();
  }

  /** Declarative tool surface for an LLM tool-calling loop. */
  static toolSchemas(): readonly ToolSchema[] {
    return [
      {
        name: "scene.block",
        description: "Set a character's blocking waypoints (and optional clip) for a shot. Positions must stay on the walkable set.",
        params: { characterId: "string", shotId: "string", waypoints: "[{ time:number, position:[x,y,z], yaw:number }]", clip: "string?" }
      },
      {
        name: "scene.gesture",
        description: "Schedule a clip/gesture for a character in a shot (keeps existing waypoints).",
        params: { characterId: "string", shotId: "string", clip: "string" }
      },
      {
        name: "scene.camera",
        description: "Set a shot's camera framing (preset and/or world subject point).",
        params: { shotId: "string", preset: "establishing|two-shot|close-up?", subject: "[x,y,z]?" }
      },
      {
        name: "scene.dress",
        description: "Place a prop instance on the set (must stay on the walkable set).",
        params: { propId: "string", position: "[x,y,z]", scale: "number", feetOffset: "number" }
      },
      {
        name: "scene.clearProps",
        description: "Remove all set dressing, or just one prop type.",
        params: { propId: "string?" }
      },
      { name: "scene.undo", description: "Undo the last committed edit.", params: {} }
    ];
  }
}
