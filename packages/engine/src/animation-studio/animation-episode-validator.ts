/**
 * animation-episode-validator.ts — the scene-coherence gate.
 *
 * Proves a generated/edited EpisodeDocument is VALID + COHERENT before it is rendered or
 * shipped: characters + props stay on the walkable set, cameras frame near the action,
 * every scheduled clip exists on the asset, every shot is covered, plus the structural
 * checks from `validateEpisodeDocumentShape`.
 *
 * HONEST CAVEAT (design doc): this proves a scene is *valid/coherent*, NOT that it is
 * *well-directed or watchable*. "Good" needs the human-review rubric — automation can
 * only keep a scene from being broken, not make it good.
 */

import { validateEpisodeDocumentShape, type EpisodeDocument, type Vec3 } from "./episode-document";

export interface EpisodeDocumentValidation {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export interface ValidateOptions {
  /** GLB clip lists per character, so scheduled clips can be checked to exist. */
  readonly availableClipsByCharacter?: Record<string, readonly string[]>;
}

export function validateEpisodeDocument(doc: EpisodeDocument, opts: ValidateOptions = {}): EpisodeDocumentValidation {
  const shape = validateEpisodeDocumentShape(doc);
  const errors: string[] = [...shape.errors];
  const warnings: string[] = [];

  const bounds = doc.walkableBounds;
  const margin = 0.6;
  const inBounds = (p: Vec3): boolean =>
    !bounds ||
    (p[0] >= bounds.min[0] - margin &&
      p[0] <= bounds.max[0] + margin &&
      p[2] >= bounds.min[2] - margin &&
      p[2] <= bounds.max[2] + margin);

  // 1. Blocking stays on the walkable set (hard error — a character off the set is broken).
  for (const b of doc.blocking) {
    for (const s of b.shots) {
      for (const w of s.waypoints) {
        if (!inBounds(w.position)) {
          errors.push(`${b.characterId} blocking in ${s.shotId} leaves the walkable set at [${w.position.map((n) => n.toFixed(2)).join(",")}]`);
        }
      }
    }
  }

  // 2. Props on the walkable set (warning — off-set props are ugly, not fatal).
  for (const d of doc.setDressing) {
    if (!inBounds(d.position)) warnings.push(`prop ${d.propId} placed off the walkable set`);
  }

  // 3. Camera frames near the action.
  for (const shot of doc.shots) {
    if (!inBounds([shot.cameraSubject[0], 0, shot.cameraSubject[2]])) {
      warnings.push(`shot ${shot.shotId} camera subject is far from the walkable set`);
    }
  }

  // 4. Every scheduled clip exists on the asset (fuzzy match; warn + note fallback).
  if (opts.availableClipsByCharacter) {
    for (const b of doc.blocking) {
      const clips = opts.availableClipsByCharacter[b.characterId];
      if (!clips || clips.length === 0) continue;
      for (const s of b.shots) {
        const want = s.clip.toLowerCase();
        const has = clips.some((c) => {
          const lc = c.toLowerCase();
          return lc === want || lc.includes(want) || want.includes(lc);
        });
        if (!has) warnings.push(`${b.characterId} clip "${s.clip}" in ${s.shotId} not found; falls back to "${clips[0]}"`);
      }
    }
  }

  // 5. Every character has blocking for every shot.
  for (const c of doc.assets.characters) {
    const cb = doc.blocking.find((b) => b.characterId === c.id);
    for (const shot of doc.shots) {
      if (!cb?.shots.find((s) => s.shotId === shot.shotId)) {
        warnings.push(`${c.id} has no blocking for ${shot.shotId} (will hold a fallback mark)`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
