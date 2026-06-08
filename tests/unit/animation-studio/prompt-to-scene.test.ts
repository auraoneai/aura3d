import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  directBeats,
  directScene,
  validateDirectedActing,
  formatDirectorReport,
  PERFORMANCE_VOCABULARY,
  type DirectorBeat,
  type DirectorSceneInput
} from "../../../packages/create-aura3d/templates/animation-studio/src/director/director-heuristics";
import {
  generateSceneFromPrompt,
  inferIntent,
  parseCast
} from "../../../packages/create-aura3d/templates/animation-studio/src/director/prompt-to-scene";
import { validateEpisodeDocumentShape } from "../../../packages/create-aura3d/templates/animation-studio/src/episode-document";
import { validateEpisodeDocument } from "../../../packages/create-aura3d/templates/animation-studio/src/animation-episode-validator";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = resolve(__dirname, "../../../packages/create-aura3d/templates/animation-studio");

/**
 * Phase F2 — prompt-to-scene proof. Given a prompt + cast + dialogue, the director's
 * per-beat acting plan must contain VISIBLE acting: at least one speaker gesture and at
 * least one listener reaction, NOT all idle/talk, and the validation gate must pass.
 * A degenerate all-talk scene must FAIL the gate (Phase F1 director validation).
 *
 * The "prompt" here is the two-office-workers-arguing scenario from the PRD examples —
 * the cast/dialogue are prompt-derived, no Moon-Garden fixture involved.
 */
describe("prompt-to-scene: director emits visible, validated acting (F1/F2/C2)", () => {
  const VOCAB = new Set<string>(PERFORMANCE_VOCABULARY);
  const GESTURES = new Set(["gesture", "point", "nod"]);
  const REACTIONS = new Set(["react", "nod"]);

  // Prompt: "two office workers arguing about a deadline."
  // Cast + dialogue derived from the prompt — questions, emphasis, disagreement, movement.
  const scene: DirectorSceneInput = {
    duration: 18,
    characters: [
      { id: "alex", entersFrom: "left" },
      { id: "sam", entersFrom: "none" }
    ],
    shots: [
      { shotId: "s0", startTime: 0, endTime: 6 },
      { shotId: "s1", startTime: 6, endTime: 12 },
      { shotId: "s2", startTime: 12, endTime: 18 }
    ],
    dialogue: [
      { lineId: "l0", speakerId: "alex", startTime: 0.2, endTime: 3.5, text: "Did you finish the deadline report?" },
      { lineId: "l1", speakerId: "sam", startTime: 3.7, endTime: 5.8, text: "No, I did NOT have time!" },
      { lineId: "l2", speakerId: "alex", startTime: 6.2, endTime: 9.0, text: "That is completely unacceptable." },
      { lineId: "l3", speakerId: "sam", startTime: 9.2, endTime: 11.5, text: "Then walk over here and help me." },
      { lineId: "l4", speakerId: "alex", startTime: 12.2, endTime: 15.0, text: "Fine. Show me where you got stuck." },
      { lineId: "l5", speakerId: "sam", startTime: 15.2, endTime: 17.8, text: "Right here, in the summary section." }
    ],
    walkableBounds: { min: [-4, 0, -4], max: [4, 0, 4] },
    props: []
  };

  const beats = (): DirectorBeat[] => directBeats(scene);

  it("emits only vocabulary intents on every beat", () => {
    for (const b of beats()) {
      expect(VOCAB.has(b.speakingIntent)).toBe(true);
      expect(VOCAB.has(b.listenerIntent)).toBe(true);
    }
  });

  it("includes >=1 speaker gesture and >=1 listener reaction", () => {
    const plan = beats();
    expect(plan.some((b) => GESTURES.has(b.speakingIntent))).toBe(true);
    expect(plan.some((b) => b.listener != null && REACTIONS.has(b.listenerIntent))).toBe(true);
  });

  it("is NOT all idle/talk — there is real motion variety", () => {
    const plan = beats();
    const allLowMotion = plan.every(
      (b) => (b.speakingIntent === "idle" || b.speakingIntent === "talk")
        && (b.listenerIntent === "idle" || b.listenerIntent === "talk")
    );
    expect(allLowMotion).toBe(false);
  });

  it("applies the acting rules: question, emphasis, disagreement, movement", () => {
    const plan = beats();
    const byLine = (id: string) => plan.find((b) => b.lineId === id)!;

    // Question ("?") → listener nods (head-tilt / acknowledges).
    expect(byLine("l0").listenerIntent).toBe("nod");
    // Emphasis ("!"/ALL-CAPS) → speaker gestures (rotated gesture/point/nod).
    expect(GESTURES.has(byLine("l1").speakingIntent)).toBe(true);
    // Disagreement / emphasis → listener reacts (stronger than a plain nod).
    expect(byLine("l1").listenerIntent).toBe("react");
    // Movement verb ("walk") → locomotion intent.
    expect(["walk", "run"]).toContain(byLine("l3").speakingIntent);
  });

  it("carries a beat-level duration estimate for every beat (C2)", () => {
    for (const b of beats()) {
      expect(b.durationSeconds).toBeGreaterThan(0);
      expect(b.durationSeconds).toBeLessThanOrEqual(22);
    }
    // Longer line gets a longer estimate (monotonic in word count).
    const short = directBeats({ ...scene, dialogue: [
      { lineId: "x", speakerId: "alex", startTime: 0, endTime: 1, text: "Hi!" }
    ] })[0]!;
    const long = directBeats({ ...scene, dialogue: [
      { lineId: "y", speakerId: "alex", startTime: 0, endTime: 1, text: "Hi there, I really need to talk to you about the deadline report we discussed earlier today." }
    ] })[0]!;
    expect(long.durationSeconds).toBeGreaterThan(short.durationSeconds);
  });

  it("accepts an injected duration estimator (C2)", () => {
    const injected = directBeats({ ...scene, durationEstimator: () => 4.2 });
    for (const b of injected) expect(b.durationSeconds).toBe(4.2);
  });

  it("gives the non-speaking listener a non-idle reaction on every beat (never frozen)", () => {
    for (const b of beats()) {
      expect(b.listener).not.toBeNull();
      expect(b.listenerIntent).not.toBe("idle");
    }
  });

  it("PASSES the director validation gate", () => {
    const result = validateDirectedActing(beats(), { cast: ["alex", "sam"] });
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("the rendered blocking (directScene) reflects the acting variety, not all idle/talk", () => {
    const directed = directScene("two-office-workers-arguing", scene);
    const clips = directed.blocking.flatMap((b) => b.shots.map((s) => s.clip));
    for (const clip of clips) expect(VOCAB.has(clip)).toBe(true);
    const allLowMotion = clips.every((c) => c === "idle" || c === "talk");
    expect(allLowMotion).toBe(false);
    // Visible body acting reaches the blocking: gestures/locomotion, not just lip-flap.
    expect(clips.some((c) => GESTURES.has(c) || c === "walk" || c === "run")).toBe(true);
  });

  it("a degenerate ALL-TALK scene FAILS the gate (low-motion + no gesture/reaction)", () => {
    // The degenerate output we must reject: every beat idle/talk, no gestures, no reactions.
    const allTalk: DirectorBeat[] = [
      { lineId: "f0", speaker: "alex", listener: "sam", text: "We talk.", speakingIntent: "talk", listenerIntent: "talk", gesture: "talk", cameraIntent: "establishing", durationSeconds: 6 },
      { lineId: "f1", speaker: "sam", listener: "alex", text: "We talk.", speakingIntent: "talk", listenerIntent: "talk", gesture: "talk", cameraIntent: "two-shot", durationSeconds: 6 }
    ];
    const result = validateDirectedActing(allTalk, { cast: ["alex", "sam"] });
    expect(result.ok).toBe(false);
    const codes = result.issues.map((x) => x.code);
    expect(codes).toContain("ALL_LOW_MOTION");
    expect(codes).toContain("NO_GESTURE");
    expect(codes).toContain("NO_REACTION");
  });

  it("a frozen (idle-only) character FAILS the STATIC_CHARACTER gate", () => {
    // One character is given a non-idle intent; the other is frozen on idle the whole scene.
    const oneFrozen: DirectorBeat[] = [
      { lineId: "g0", speaker: "alex", listener: "ghost", text: "Anyone there?", speakingIntent: "gesture", listenerIntent: "idle", gesture: "gesture", cameraIntent: "establishing", durationSeconds: 4 },
      { lineId: "g1", speaker: "alex", listener: "ghost", text: "Hello?", speakingIntent: "talk", listenerIntent: "idle", gesture: "talk", cameraIntent: "two-shot", durationSeconds: 4 }
    ];
    const result = validateDirectedActing(oneFrozen, { cast: ["alex", "ghost"] });
    expect(result.ok).toBe(false);
    expect(result.issues.some((x) => x.code === "STATIC_CHARACTER" && x.characterId === "ghost")).toBe(true);
  });

  it("allows a deliberately staged static character (no false STATIC failure)", () => {
    // A background extra "intern" the director froze on purpose must not fail the gate.
    const withExtra: DirectorBeat[] = [
      ...beats(),
      {
        lineId: "extra",
        speaker: "alex",
        listener: "intern",
        text: "Meanwhile the intern waits.",
        speakingIntent: "talk",
        listenerIntent: "idle",
        gesture: "talk",
        cameraIntent: "medium",
        durationSeconds: 2
      }
    ];
    const failed = validateDirectedActing(withExtra, { cast: ["alex", "sam", "intern"] });
    expect(failed.issues.some((x) => x.code === "STATIC_CHARACTER" && x.characterId === "intern")).toBe(true);
    const staged = validateDirectedActing(withExtra, { cast: ["alex", "sam", "intern"], stagedStatic: ["intern"] });
    expect(staged.issues.some((x) => x.characterId === "intern")).toBe(false);
  });

  it("produces a readable beat-by-beat report", () => {
    const report = formatDirectorReport(beats());
    expect(report).toContain("alex");
    expect(report).toContain("sam");
    expect(report.split("\n").length).toBeGreaterThan(scene.dialogue.length);
  });
});

/**
 * Phase F2 — prompt-to-scene GENERATION. A fresh EpisodeDocument is generated from a prompt
 * with NO fallback: cast / set / props / dialogue / camera / actions are all derived FROM THE
 * PROMPT TERMS. The regression FAILS if the generator silently reuses the Moon Garden fixture
 * (its set, its miko/luma cast, its mushroom props, or any moon marker) for a non-moon prompt.
 * A sample document for a non-moon prompt is generated + saved as evidence.
 */
describe("prompt-to-scene: full generation, no Moon-Garden fallback (F2)", () => {
  const MOON_MARKERS = ["moon", "moon-garden", "glow-stone", "miko", "luma", "mushroom", "lily", "garden"];

  function allStrings(value: unknown, out: string[] = []): string[] {
    if (typeof value === "string") out.push(value.toLowerCase());
    else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        out.push(k.toLowerCase());
        allStrings(v, out);
      }
    }
    return out;
  }
  function moonMarkersIn(doc: unknown): string[] {
    const hay = allStrings(doc);
    const hits: string[] = [];
    for (const token of hay) for (const m of MOON_MARKERS) if (token.includes(m)) hits.push(`${m} in "${token}"`);
    return hits;
  }

  const PROMPT = "two robots fixing a car in a garage";

  it("derives the CAST from the prompt (robots → robot-1, robot-2), not miko/luma", () => {
    const cast = parseCast(PROMPT);
    expect(cast).toEqual(["robot-1", "robot-2"]);
    expect(cast).not.toContain("miko");
    expect(cast).not.toContain("luma");
  });

  it("infers the scene INTENT from prompt verbs (fixing → task)", () => {
    expect(inferIntent(PROMPT)).toBe("task");
    expect(inferIntent("two office workers arguing about a deadline")).toBe("argument");
    expect(inferIntent("a chef teaching a child to bake")).toBe("teaching");
    expect(inferIntent("what happened to the ship?")).toBe("question");
  });

  it("rejects an empty prompt — there is NO default scene to fall back to", () => {
    expect(() => generateSceneFromPrompt("   ")).toThrow(/non-empty prompt/);
  });

  it("generates a COMPLETE, shape-valid document with cast + dialogue + shots + actions", () => {
    const { document } = generateSceneFromPrompt(PROMPT);
    const shape = validateEpisodeDocumentShape(document);
    expect(shape.ok).toBe(true);
    expect(document.assets.characters.length).toBeGreaterThanOrEqual(2);
    expect(document.shots.length).toBeGreaterThanOrEqual(2);
    expect(document.dialogue?.lines.length).toBeGreaterThan(0);
    expect(document.blocking.length).toBe(document.assets.characters.length);
    // The coherence validator passes (cast on set, cameras framed, clips resolvable).
    const coherence = validateEpisodeDocument(document, {
      availableClipsByCharacter: Object.fromEntries(
        document.assets.characters.map((c) => [c.id, c.availableClips ?? []])
      )
    });
    expect(coherence.ok).toBe(true);
  });

  it("prompt TERMS influence the document — cast, set, props, dialogue all reference the prompt", () => {
    const { document, setTemplateId } = generateSceneFromPrompt(PROMPT);
    // CAST: robot ids from the prompt noun.
    expect(document.assets.characters.map((c) => c.id)).toEqual(["robot-1", "robot-2"]);
    // SET: a garage/robot prompt selects the space-station template (its keywords include "robot"),
    //      NOT moon-garden, NOT the neutral studio fallback either (a keyword matched).
    expect(setTemplateId).not.toBe("moon-garden");
    // PROPS: the prompt's explicit object noun "car" becomes a registered prop.
    expect(document.assets.props.map((p) => p.id)).toContain("car");
    // DIALOGUE: the synthesised lines reference the prompt topic ("car").
    const dialogueText = (document.dialogue?.lines ?? []).map((l) => l.text.toLowerCase()).join(" ");
    expect(dialogueText).toContain("car");
  });

  it("CAMERA + ACTIONS come from the director — varied shots, never all idle/talk", () => {
    const { document } = generateSceneFromPrompt(PROMPT);
    // Camera: shots carry real presets and tile the timeline from 0.
    expect(document.shots[0]!.startTime).toBe(0);
    const presets = new Set(document.shots.map((s) => s.presetId));
    expect(presets.size).toBeGreaterThanOrEqual(2);
    // Actions: the per-character blocking clips are not all idle/talk (visible acting).
    const clips = document.blocking.flatMap((b) => b.shots.map((s) => s.clip));
    expect(clips.length).toBeGreaterThan(0);
    const allLowMotion = clips.every((c) => c === "idle" || c === "talk");
    expect(allLowMotion).toBe(false);
  });

  it("is DETERMINISTIC — the same prompt yields the byte-identical document", () => {
    const a = JSON.stringify(generateSceneFromPrompt(PROMPT).document);
    const b = JSON.stringify(generateSceneFromPrompt(PROMPT).document);
    expect(a).toBe(b);
  });

  it("FAILS if it silently reuses Moon Garden — a NON-moon prompt has ZERO moon markers", () => {
    const nonMoonPrompts = [
      "two robots fixing a car in a garage",
      "two office workers arguing about a deadline",
      "a chef teaching a child to bake bread"
    ];
    for (const prompt of nonMoonPrompts) {
      const { document, setTemplateId } = generateSceneFromPrompt(prompt);
      expect(setTemplateId).not.toBe("moon-garden");
      expect(moonMarkersIn(document)).toEqual([]);
    }
  });

  it("a MOON prompt still legitimately selects the moon-garden set (it's one template)", () => {
    const { setTemplateId } = generateSceneFromPrompt("a quiet moon garden at night with glowing lilies");
    expect(setTemplateId).toBe("moon-garden");
  });

  it("saves a sample generated document (non-moon prompt) as F2 evidence", () => {
    const { document } = generateSceneFromPrompt(PROMPT);
    const outDir = resolve(TEMPLATE_ROOT, "dist", "episodes", "prompt-to-scene-proof");
    mkdirSync(outDir, { recursive: true });
    const outPath = resolve(outDir, "two-robots-fixing-a-car.document.json");
    writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`);
    // Sanity: the saved doc is the same one we validated, with no moon leakage.
    expect(moonMarkersIn(document)).toEqual([]);
    expect(document.dialogue?.lines.length).toBeGreaterThan(0);
  });
});
