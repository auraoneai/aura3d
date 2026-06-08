/**
 * scene-tools.ts — pure EpisodeDocument transforms.
 *
 * Each function returns a NEW document; the store validates + commits (or rejects). The
 * agent never edits raw code — only these typed, validated edits.
 */

import type { CameraPresetId } from "@aura3d/engine";
import type { BlockingWaypoint, CharacterBlocking, DialogueLine, EpisodeDocument, PropPlacement, ShotBlocking, ShotSpec, Vec3 } from "../episode-document";
import { estimateSpeechDuration } from "../episode-document";

/** Small breath between consecutive lines so speech doesn't run together. */
const INTER_LINE_GAP = 0.15;

/** Re-lay shots contiguously from t=0 (preserving each shot's duration); update the
 * document duration + world-state span to match. Shots must cover the timeline with no
 * gaps, so every shot edit re-contiguizes. */
function withShots(doc: EpisodeDocument, shots: readonly ShotSpec[]): EpisodeDocument {
  let t = 0;
  const rec = shots.map((s) => {
    const dur = Math.max(0.1, s.endTime - s.startTime);
    const out = { ...s, startTime: t, endTime: t + dur };
    t += dur;
    return out;
  });
  const duration = rec.length ? rec[rec.length - 1]!.endTime : doc.duration;
  return { ...doc, shots: rec, duration, worldState: { glowSpanSeconds: duration } };
}

/** Append a shot (given a duration); the timeline re-contiguizes. */
export function addShot(doc: EpisodeDocument, shotId: string, presetId: CameraPresetId, duration: number, cameraSubject: Vec3): EpisodeDocument {
  return withShots(doc, [...doc.shots, { shotId, presetId, startTime: 0, endTime: duration, cameraSubject }]);
}

/** Remove a shot; the timeline closes up. */
export function removeShot(doc: EpisodeDocument, shotId: string): EpisodeDocument {
  return withShots(doc, doc.shots.filter((s) => s.shotId !== shotId));
}

/** Change a shot's duration; following shots shift to stay contiguous. */
export function retimeShot(doc: EpisodeDocument, shotId: string, duration: number): EpisodeDocument {
  return withShots(doc, doc.shots.map((s) => (s.shotId === shotId ? { ...s, endTime: s.startTime + Math.max(0.1, duration) } : s)));
}

function upsertCharacterShot(
  blocking: readonly CharacterBlocking[],
  characterId: string,
  shotId: string,
  update: (beat: ShotBlocking) => ShotBlocking
): CharacterBlocking[] {
  const defaultBeat: ShotBlocking = { shotId, clip: "idle", waypoints: [] };
  const existing = blocking.find((b) => b.characterId === characterId);
  if (!existing) {
    return [...blocking, { characterId, shots: [update(defaultBeat)] }];
  }
  return blocking.map((b) =>
    b.characterId !== characterId
      ? b
      : {
          ...b,
          shots: b.shots.some((s) => s.shotId === shotId)
            ? b.shots.map((s) => (s.shotId !== shotId ? s : update(s)))
            : [...b.shots, update(defaultBeat)]
        }
  );
}

/** Set a character's blocking waypoints (and optionally clip) for a shot. */
export function setBlocking(
  doc: EpisodeDocument,
  characterId: string,
  shotId: string,
  waypoints: readonly BlockingWaypoint[],
  clip?: string
): EpisodeDocument {
  const blocking = upsertCharacterShot(doc.blocking, characterId, shotId, (beat) => ({
    ...beat,
    clip: clip ?? beat.clip,
    waypoints: [...waypoints]
  }));
  return { ...doc, blocking };
}

/** Schedule a clip/gesture for a character in a shot (keeps the existing waypoints). */
export function setGesture(doc: EpisodeDocument, characterId: string, shotId: string, clip: string): EpisodeDocument {
  const blocking = upsertCharacterShot(doc.blocking, characterId, shotId, (beat) => ({ ...beat, clip }));
  return { ...doc, blocking };
}

/** Set a shot's camera framing (preset and/or subject). */
export function setCamera(
  doc: EpisodeDocument,
  shotId: string,
  opts: { preset?: CameraPresetId; subject?: Vec3 }
): EpisodeDocument {
  return {
    ...doc,
    shots: doc.shots.map((s) =>
      s.shotId !== shotId ? s : { ...s, presetId: opts.preset ?? s.presetId, cameraSubject: opts.subject ?? s.cameraSubject }
    )
  };
}

/** Add a prop instance to the set dressing. */
export function placeProp(doc: EpisodeDocument, placement: PropPlacement): EpisodeDocument {
  return { ...doc, setDressing: [...doc.setDressing, placement] };
}

/** Clear set dressing (all, or just one prop type). */
export function clearProps(doc: EpisodeDocument, propId?: string): EpisodeDocument {
  return { ...doc, setDressing: propId ? doc.setDressing.filter((d) => d.propId !== propId) : [] };
}

/** Set a character's uniform scale (sizing a resolved GLB to read at the right height). */
export function setCharacterScale(doc: EpisodeDocument, characterId: string, scale: number): EpisodeDocument {
  return { ...doc, assets: { ...doc.assets, characters: doc.assets.characters.map((c) => (c.id === characterId ? { ...c, scale } : c)) } };
}

/**
 * Add or update a dialogue line (the scene's caption + lip-sync source / AuraVoice
 * contract). When `endTime` is not explicitly provided (omitted, or <= startTime — the
 * CLI's "unset" sentinel of 0), it is auto-computed as
 * `startTime + estimateSpeechDuration(text)` so captions show only while the line would
 * be spoken instead of lingering on a fixed window.
 */
export function setDialogueLine(
  doc: EpisodeDocument,
  line: Omit<DialogueLine, "endTime" | "startTime"> & { startTime?: number; endTime?: number }
): EpisodeDocument {
  const existing = doc.dialogue ?? { language: "en", lines: [] };
  const startTime = typeof line.startTime === "number" ? line.startTime : 0;
  const endProvided = typeof line.endTime === "number" && line.endTime > startTime;
  const resolved: DialogueLine = {
    lineId: line.lineId,
    speakerId: line.speakerId,
    text: line.text,
    startTime,
    endTime: endProvided ? (line.endTime as number) : startTime + estimateSpeechDuration(line.text)
  };
  const lines = existing.lines.some((l) => l.lineId === resolved.lineId)
    ? existing.lines.map((l) => (l.lineId === resolved.lineId ? resolved : l))
    : [...existing.lines, resolved];
  return { ...doc, dialogue: { language: existing.language, lines: [...lines].sort((a, b) => a.startTime - b.startTime) } };
}

/**
 * Re-sequence ALL dialogue lines back-to-back from t=0 using estimateSpeechDuration, so
 * captions are paced by speech length with a small inter-line gap and never overlap.
 * Lines keep their existing document order (already startTime-sorted by setDialogueLine);
 * each line's start = previous line's end + gap, end = start + estimated speech duration.
 * Returns a NEW document; the computed start/end are stored in the dialogue track.
 */
export function retimeDialogue(doc: EpisodeDocument): EpisodeDocument {
  if (!doc.dialogue || doc.dialogue.lines.length === 0) return doc;
  let t = 0;
  const lines: DialogueLine[] = doc.dialogue.lines.map((l, i) => {
    const start = i === 0 ? 0 : t + INTER_LINE_GAP;
    const end = start + estimateSpeechDuration(l.text);
    t = end;
    return { ...l, startTime: start, endTime: end };
  });
  return { ...doc, dialogue: { ...doc.dialogue, lines } };
}

/** Remove a dialogue line. */
export function removeDialogueLine(doc: EpisodeDocument, lineId: string): EpisodeDocument {
  if (!doc.dialogue) return doc;
  return { ...doc, dialogue: { ...doc.dialogue, lines: doc.dialogue.lines.filter((l) => l.lineId !== lineId) } };
}
