import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type CheckboxState = "checked" | "unchecked";

type Checkbox = {
  readonly line: number;
  readonly state: CheckboxState;
  readonly text: string;
};

type SourceRequirement = {
  readonly file: string;
  readonly tokens: readonly string[];
};

type SourceBackedCheckbox = {
  readonly text: string;
  readonly rationale: string;
  readonly source: readonly SourceRequirement[];
};

type EvidenceGate = {
  readonly text: string;
  readonly gate: "command" | "browser" | "screenshot" | "package" | "dist" | "deploy" | "visual" | "runtime-report" | "cross-repo";
  readonly requiredEvidence: readonly string[];
};

type SourceStatus = SourceRequirement & {
  readonly exists: boolean;
  readonly missingTokens: readonly string[];
};

type SourceBackedStatus = SourceBackedCheckbox & {
  readonly checkbox?: Checkbox | undefined;
  readonly checked: boolean;
  readonly sourceBacked: boolean;
  readonly sources: readonly SourceStatus[];
};

type EvidenceGateStatus = EvidenceGate & {
  readonly checkbox?: Checkbox | undefined;
  readonly checked: boolean;
};

type EvidenceManifestRequirement = {
  readonly file: string;
  readonly kind: string;
  readonly tokens: readonly string[];
  readonly proofIds: readonly string[];
};

type EvidenceManifestStatus = EvidenceManifestRequirement & {
  readonly exists: boolean;
  readonly manifestKind?: string | undefined;
  readonly kindMatched: boolean;
  readonly parseError?: string | undefined;
  readonly proofIdsFound: readonly string[];
  readonly missingTokens: readonly string[];
  readonly missingProofIds: readonly string[];
};

const root = process.cwd();
const prdPath = "docs/project/game-runtime-release.md";

const sourceBackedCheckboxes: readonly SourceBackedCheckbox[] = [
  {
    text: "An animation library can retarget onto a humanoid model with documented constraints.",
    rationale: "AnimationController exposes retarget metadata and diagnostics, and docs describe explicit humanoid constraints.",
    source: [
      {
        file: "packages/engine/src/agent-api/AnimationController.ts",
        tokens: ["AuraAnimationRetargetBindingMetadata", "explicit-humanoid-bone-map", "retargetDiagnostics"]
      },
      {
        file: "docs/api/game-runtime.md",
        tokens: ["External humanoid animation libraries are represented as metadata", "explicit-humanoid-bone-map"]
      }
    ]
  },
  {
    text: "CLI can generate a typed `aura-assets.ts` entry with animation metadata.",
    rationale: "The CLI writes defineAuraAssets entries with animations and animationClips metadata.",
    source: [
      {
        file: "packages/aura3d-cli/src/index.ts",
        tokens: ["DEFAULT_AURA_ASSET_TYPEGEN", "defineAuraAssets", "animationClips: asset.animations"]
      }
    ]
  },
  {
    text: "Press/release edges are correct across frames.",
    rationale: "The game-runtime input unit source asserts pressed, held, released, buffered, axis, and replay state transitions.",
    source: [
      {
        file: "tests/unit/game-runtime/input.test.ts",
        tokens: ["tracks pressed, held, released, buffered, axis, and replay state deterministically", "pressed: true", "released: true"]
      }
    ]
  },
  {
    text: "Replay test produces identical action sequence.",
    rationale: "The game-runtime input unit source records input and replays the recorded action state.",
    source: [
      {
        file: "tests/unit/game-runtime/input.test.ts",
        tokens: ["const replayed = replay.replay(input.recorded())", "expect(replayed.actions.moveLeft)", "replay.clearReplay()"]
      }
    ]
  },
  {
    text: "Implement debug overlay and debug scene nodes for hitboxes.",
    rationale: "GameRuntime exposes source-level hitbox/combat debug geometry and overlay records.",
    source: [
      {
        file: "packages/engine/src/agent-api/GameRuntime.ts",
        tokens: ["createGameHitboxDebugGeometry", "createGameCombatDebugGeometry", "kind: \"aura-game-debug-overlay\""]
      },
      {
        file: "docs/api/game-runtime.md",
        tokens: ["game.debug.hitboxes", "game.debug.combat", "Source-level debug overlay data"]
      }
    ]
  },
  {
    text: "Combat events drive effects and HUD.",
    rationale: "The fighting-game template consumes combat events, emits runtime effects, and updates HUD text through Aura3D UI helpers.",
    source: [
      {
        file: "packages/create-aura3d/templates/fighting-game/src/main.ts",
        tokens: ["for (const event of combat.consumeEvents())", "runtimeEffects", "ui.setText(hudPlayerHealth"]
      },
      {
        file: "tests/browser/game-runtime-visual.spec.ts",
        tokens: ["hudUpdate", "bridge.hud", "hitSpark", "effectSnapshot.spawned"]
      }
    ]
  },
  {
    text: "Reduced-motion mode disables camera shake and limits flash intensity.",
    rationale: "Camera shake is suppressed when reducedMotion is enabled, and effects limit flash/motion when reduced flags are set.",
    source: [
      {
        file: "packages/engine/src/agent-api/GameRuntime.ts",
        tokens: ["const shake = reducedMotion ? 0", "if (reducedMotion) return;", "const flashLimited = reducedFlash"]
      }
    ]
  },
  {
    text: "Impact shake occurs on hit event and disables in reduced-motion mode.",
    rationale: "The fighting kit triggers camera impact from hit/block events, while the camera director no-ops impact under reduced motion.",
    source: [
      {
        file: "packages/engine/src/agent-api/game-kits/fighting.ts",
        tokens: ["effects.hitSpark(event.position", "camera.impact(1.1)", "camera.impact(0.55)"]
      },
      {
        file: "packages/engine/src/agent-api/GameRuntime.ts",
        tokens: ["impact(intensity", "if (reducedMotion) return;"]
      }
    ]
  },
  {
    text: "Validator catches floating hair, missing clips, wrong facing direction, oversized bounds, and invisible material.",
    rationale: "Game asset validation and CLI readiness checks cover animation clips, bounds, facing, material visibility, and floating-hair risk.",
    source: [
      {
        file: "packages/engine/src/agent-api/GameAssetValidation.ts",
        tokens: ["animation.clips-present", "bounds.max-dimension", "materials"]
      },
      {
        file: "packages/aura3d-cli/src/index.ts",
        tokens: ["floating hair risk detected", "wrong facing direction", "invisible or unreadable material", "oversized bounds detected"]
      }
    ]
  },
  {
    text: "Stage exposes combat bounds for physics and camera.",
    rationale: "The fighting stage builder exposes combatBounds and validateStage checks safe zones against those bounds.",
    source: [
      {
        file: "packages/engine/src/agent-api/game-kits/fighting.ts",
        tokens: ["readonly combatBounds", "combatBounds,", "safe zone must stay inside combat bounds"]
      },
      {
        file: "docs/api/game-runtime.md",
        tokens: ["combat bounds", "stage.combatBounds"]
      }
    ]
  },
  {
    text: "HUD updates from combat events without manual query selectors.",
    rationale: "The fighting-game template binds DOM through Aura3D UI helpers and updates HUD values from combat state.",
    source: [
      {
        file: "packages/create-aura3d/templates/fighting-game/src/main.ts",
        tokens: ["const hudPlayerHealth = ui.text", "ui.setText(hudPlayerHealth", "combat.consumeEvents()"]
      }
    ]
  },
  {
    text: "Accessibility settings affect camera/effects.",
    rationale: "The template passes reduced-motion and reduced-flash preferences into Aura3D camera/effects helpers and records accessibility source evidence.",
    source: [
      {
        file: "packages/create-aura3d/templates/fighting-game/src/main.ts",
        tokens: ["game.accessibility.reducedMotion", "game.accessibility.reducedFlash", "game.cameraDirector({ stageBounds", "game.effects({ poolSize"]
      },
      {
        file: "packages/engine/src/agent-api/GameRuntime.ts",
        tokens: ["Aura3D camera and effects helpers consume reducedMotion flags", "Aura3D effects helpers consume reducedFlash flags"]
      }
    ]
  },
  {
    text: "Include test route proving storyboard playback and caption timing.",
    rationale: "The cartoon-channel template includes a storyboard playback browser spec source file and prompt-animation readiness tracks it as a required file.",
    source: [
      {
        file: "packages/create-aura3d/templates/cartoon-channel/tests/storyboard-playback.spec.ts",
        tokens: ["caption", "shot"]
      },
      {
        file: "tools/prompt-animation-readiness/index.ts",
        tokens: ["packages/create-aura3d/templates/cartoon-channel/tests/storyboard-playback.spec.ts"]
      }
    ]
  },
  {
    text: "Runtime node mutation works.",
    rationale: "Runtime node source gates cover mutable nodes without app recreation.",
    source: [
      {
        file: "packages/engine/src/agent-api/index.ts",
        tokens: ["runtimeNodes.reset(renderSnapshot);", "nodes: runtimeNodes"]
      },
      {
        file: "tools/game-runtime-readiness/index.ts",
        tokens: ["app.nodes.require(\"player\")", "not.toContain(\"app.setScene(\")"]
      },
      {
        file: "tests/browser/game-runtime-mutability.spec.ts",
        tokens: ["typedGlbRuntimeNodeMutationDeclaration", "model(assets.fighter)", "game.runtimeNode", "playerX changes without createAuraApp route recreation"]
      }
    ]
  },
  {
    text: "Kinematic body works.",
    rationale: "GameRuntime and game-runtime unit source cover kinematic movement, jumping, clamping, snapping, and bounds.",
    source: [
      {
        file: "packages/engine/src/agent-api/GameRuntime.ts",
        tokens: ["createGameKinematicBody", "jump(nextVelocity", "dash(direction", "snapToGround"]
      },
      {
        file: "tests/unit/game-runtime/kinematic-body.test.ts",
        tokens: ["moves, jumps, clamps, snaps, and reports AABB bounds deterministically"]
      },
      {
        file: "tests/browser/game-runtime-visual.spec.ts",
        tokens: ["physics", "game.kinematicBody", "grounded", "clampedX"]
      }
    ]
  },
  {
    text: "Combat hitbox/hurtbox resolver works.",
    rationale: "GameRuntime combat world resolves hitboxes against hurtboxes and exposes typed combat events.",
    source: [
      {
        file: "packages/engine/src/agent-api/GameRuntime.ts",
        tokens: ["createCombatWorld", "hurtboxes", "hitboxes", "type: \"hit\""]
      },
      {
        file: "tests/unit/game-runtime/hitbox-world.test.ts",
        tokens: ["knockback", "hit"]
      },
      {
        file: "tests/browser/game-runtime-visual.spec.ts",
        tokens: ["collision", "hitboxOverlay", "game.debug.overlay", "contact-point"]
      }
    ]
  },
  {
    text: "Runtime effects and camera director work.",
    rationale: "GameRuntime exposes effects and camera directors, and the fighting kit wires them into hit events and frame updates.",
    source: [
      {
        file: "packages/engine/src/agent-api/GameRuntime.ts",
        tokens: ["createGameEffects", "createGameCameraDirector", "effects.push(effect)", "snapshot()"]
      },
      {
        file: "packages/engine/src/agent-api/game-kits/fighting.ts",
        tokens: ["const camera = createGameCameraDirector", "const effects = createGameEffects", "effects.update(dt)", "camera.update(dt"]
      },
      {
        file: "tests/browser/game-runtime-visual.spec.ts",
        tokens: ["hitSpark", "cameraShake", "camera.update", "bridge.cameraImpacts"]
      }
    ]
  },
  {
    text: "Stage builder produces a non-blocking fighting arena.",
    rationale: "The fighting stage builder emits foreground/midground/background/parallax layers and validates blocking/camera-safe status.",
    source: [
      {
        file: "packages/engine/src/agent-api/game-kits/fighting.ts",
        tokens: ["createFightingStage", "must not block fighter silhouettes", "foreground floor remains below fighter silhouettes"]
      },
      {
        file: "docs/api/game-runtime.md",
        tokens: ["Fighting stage builder", "non-blocking geometry status"]
      }
    ]
  },
  {
    text: "Game asset validation catches broken character assembly.",
    rationale: "The asset validation CLI catches missing body assets, hair-only assembly risk, missing bounds, wrong facing, oversized bounds, and invisible materials.",
    source: [
      {
        file: "packages/aura3d-cli/src/index.ts",
        tokens: ["Missing body asset", "floating hair risk detected", "wrong facing direction", "oversized bounds detected", "invisible or unreadable material"]
      }
    ]
  },
  {
    text: "Mitigation: ship embedded-clip playback first, then external humanoid retargeting behind explicit diagnostics.",
    rationale: "AnimationController supports embedded clip playback and explicit retarget diagnostics for external humanoid metadata.",
    source: [
      {
        file: "packages/engine/src/agent-api/AnimationController.ts",
        tokens: ["registerClip", "play(", "retargetDiagnostics"]
      },
      {
        file: "docs/api/game-runtime.md",
        tokens: ["External humanoid animation libraries are represented as metadata"]
      }
    ]
  },
  {
    text: "Mitigation: add evidence API proving loop, node mutation, input, physics, collision, animation, effects, and camera are Aura3D-owned systems.",
    rationale: "GameEvidence reports source/runtime systems for mutable nodes, frame loop, input, physics, animation, effects, camera, collision, and stage.",
    source: [
      {
        file: "packages/engine/src/agent-api/GameEvidence.ts",
        tokens: ["systems:", "mutableNodes", "frameLoop", "input", "physics", "animation", "effectsPlan", "cameraPlan", "collisionPlan"]
      },
      {
        file: "docs/api/game-runtime.md",
        tokens: ["systems`: booleans for mutable nodes, frame loop, input, physics, animation, effects, camera, collision, and stage"]
      },
      {
        file: "tests/reports/game-runtime/runtime-evidence.manifest.json",
        tokens: ["collectGameRuntimeEvidence(app)", "mutableNodes", "frameLoop", "collision", "cameraPlan"]
      }
    ]
  },
  {
    text: "Mitigation: add stage safe-zone validation and screenshot-oriented browser tests.",
    rationale: "Stage safe-zone validation exists in source, and game-runtime visual browser test source is declared by readiness automation.",
    source: [
      {
        file: "packages/engine/src/agent-api/game-kits/fighting.ts",
        tokens: ["validateFightingStage", "safe zone must stay inside combat bounds"]
      },
      {
        file: "tools/game-runtime-readiness/index.ts",
        tokens: ["tests/browser/game-runtime-visual.spec.ts"]
      }
    ]
  }
];

const evidenceGates: readonly EvidenceGate[] = [
  {
    text: "`pnpm typecheck`, targeted unit tests, targeted browser tests, template build, package smoke, and release readiness pass.",
    gate: "command",
    requiredEvidence: ["Captured command output for every listed gate."]
  },
  {
    text: "Browser tests verify real rendered movement, controls, physics, collision, animation state changes, and visual nonblank output.",
    gate: "browser",
    requiredEvidence: ["Passing browser test report and retained rendered-output evidence."]
  },
  {
    text: "Browser tests verify storyboard shot playback, character performance state changes, caption timing, camera cuts, and visually nonblank cartoon frames.",
    gate: "browser",
    requiredEvidence: ["Passing browser test report and retained cartoon frame evidence."]
  },
  {
    text: "Confirm generated `dist/engine/agent-api/index.d.ts` exposes the new public types.",
    gate: "dist",
    requiredEvidence: ["Generated dist declaration file from a build artifact."]
  },
  {
    text: "A Quaternius-derived fighter can pass validation before being used in a template. Source validator contract exists, but no checked Quaternius-derived fixture/evidence is recorded here.",
    gate: "command",
    requiredEvidence: [
      "Archived assets validate-game output for a typed Quaternius-derived fighter.",
      "Typed aura-assets metadata naming the Quaternius fighter asset, bounds, clips, humanoid status, materials, and provenance.",
      "Retained route/runtime evidence showing the validated fighter is used before template publication."
    ]
  },
  {
    text: "Browser screenshot shows a typed GLB fighter moving through runtime node mutation.",
    gate: "screenshot",
    requiredEvidence: ["Screenshot path, hash, dimensions, and route/runtime metadata."]
  },
  {
    text: "Browser screenshot shows hitbox debug overlay.",
    gate: "screenshot",
    requiredEvidence: ["Screenshot path, hash, dimensions, and overlay metadata."]
  },
  {
    text: "Browser screenshot shows a collision causing damage, hit spark, camera shake, and HUD update.",
    gate: "screenshot",
    requiredEvidence: ["Screenshot path, hash, dimensions, collision event, HUD, effect, and camera metadata."]
  },
  {
    text: "Browser screenshot shows a non-blocking authored fighting stage.",
    gate: "screenshot",
    requiredEvidence: ["Screenshot path, hash, dimensions, and stage source/evidence metadata."]
  },
  {
    text: "`collectGameRuntimeEvidence(app)` JSON is saved under `tests/reports/game-runtime/`.",
    gate: "runtime-report",
    requiredEvidence: ["tests/reports/game-runtime/*.json with systems proof."]
  },
  {
    text: "`prompt-animation-evidence.json` proves storyboard, captions, shot timing, and screenshots.",
    gate: "runtime-report",
    requiredEvidence: ["prompt-animation-evidence.json with screenshot hashes and timing proof."]
  },
  {
    text: "`auravoice-contract-proof.json` proves AuraVoice artifacts validate against Aura3D schemas.",
    gate: "runtime-report",
    requiredEvidence: ["auravoice-contract-proof.json with validation result."]
  },
  {
    text: "`viseme-sync-proof.json` proves primitive and GLB mouth timing stays within one frame at 30 fps.",
    gate: "runtime-report",
    requiredEvidence: ["viseme-sync-proof.json with drift metrics."]
  },
  {
    text: "`dub-sync-proof.json` proves a dubbed language render keeps stable shot ids.",
    gate: "runtime-report",
    requiredEvidence: ["dub-sync-proof.json with source/dub shot-id continuity."]
  },
  {
    text: "Cross-repo fixture: consume a sample package from `/Users/gurbakshchahal/platforms/auravoice` and render Aura3D evidence without editing generated timing files by hand.",
    gate: "cross-repo",
    requiredEvidence: ["Cross-repo run log and archived Aura3D evidence from the generated AuraVoice package."]
  }
];

const evidenceManifestExpectations: readonly EvidenceManifestRequirement[] = [
  {
    file: "tests/reports/game-runtime/browser-evidence.manifest.json",
    kind: "aura3d-game-runtime-browser-evidence-manifest",
    tokens: [
      "pending-execution",
      "renderedMovement",
      "controls",
      "physics",
      "collision",
      "animationStateChanges",
      "nonblankVisualOutput",
      "hitboxOverlay",
      "hitSpark",
      "cameraShake",
      "hudUpdate",
      "typedGlbRuntimeNodeMutation",
      "screenshot.sha256"
    ],
    proofIds: [
      "renderedMovement",
      "controls",
      "physics",
      "collision",
      "animationStateChanges",
      "nonblankVisualOutput",
      "hitboxOverlay",
      "hitSpark",
      "cameraShake",
      "hudUpdate",
      "typedGlbRuntimeNodeMutation"
    ]
  },
  {
    file: "tests/reports/game-runtime/runtime-evidence.manifest.json",
    kind: "aura3d-game-runtime-runtime-evidence-manifest",
    tokens: [
      "pending-execution",
      "collectGameRuntimeEvidence(app)",
      "game.evidence(app)",
      "mutableNodes",
      "frameLoop",
      "input",
      "physics",
      "collision",
      "animation",
      "effectsPlan",
      "cameraPlan",
      "stage"
    ],
    proofIds: ["collectGameRuntimeEvidence", "auraOwnedRuntimeSystems", "typedRuntimeNodes"]
  }
];

const checkboxPattern = /^(\s*)- \[( |x)\] (.+)$/;
const prd = read(prdPath);
const checkboxes = prd
  .split(/\r?\n/)
  .map((line, index): Checkbox | undefined => {
    const match = checkboxPattern.exec(line);
    if (!match) return undefined;
    return {
      line: index + 1,
      state: match[2] === "x" ? "checked" : "unchecked",
      text: match[3]
    };
  })
  .filter((checkbox): checkbox is Checkbox => Boolean(checkbox));

const sourceStatuses = sourceBackedCheckboxes.map(sourceStatus);
const evidenceStatuses = evidenceGates.map(evidenceStatus);
const evidenceManifestStatuses = evidenceManifestExpectations.map(evidenceManifestStatus);
const unchecked = checkboxes.filter((checkbox) => checkbox.state === "unchecked");
const checked = checkboxes.filter((checkbox) => checkbox.state === "checked");
const sourceBackedUnchecked = sourceStatuses.filter((status) => status.sourceBacked && !status.checked);
const checkedButSourceMissing = sourceStatuses.filter((status) => status.checked && !status.sourceBacked);
const checkedEvidenceGates = evidenceStatuses.filter((status) => status.checked);
const unrunEvidenceGates = evidenceStatuses.filter((status) => !status.checked);
const missingEvidenceManifestExpectations = evidenceManifestStatuses.filter((status) =>
  !status.exists ||
  !status.kindMatched ||
  Boolean(status.parseError) ||
  status.missingTokens.length > 0 ||
  status.missingProofIds.length > 0
);

const report = {
  kind: "aura3d-105-game-runtime-prd-reconciliation",
  scope: "source-only",
  prd: prdPath,
  counts: {
    checkboxes: checkboxes.length,
    checked: checked.length,
    unchecked: unchecked.length,
    sourceBackedManifestEntries: sourceStatuses.length,
    sourceBackedUnchecked: sourceBackedUnchecked.length,
    checkedButSourceMissing: checkedButSourceMissing.length,
    evidenceGatesTracked: evidenceStatuses.length,
    checkedEvidenceGatesWithoutProofInspection: checkedEvidenceGates.length,
    unrunEvidenceGates: unrunEvidenceGates.length,
    evidenceManifestsTracked: evidenceManifestStatuses.length,
    evidenceManifestExpectationsMissing: missingEvidenceManifestExpectations.length
  },
  boundary:
    "This tool reads source files and PRD text only. It does not run typecheck, unit tests, browser tests, builds, package smoke, publish, deploy, or visual approval. Evidence gates stay open until archived evidence files prove them.",
  sourceBacked: sourceStatuses,
  evidenceManifests: evidenceManifestStatuses,
  unrunEvidenceGates,
  checkedEvidenceGates,
  discrepancies: {
    sourceBackedUnchecked,
    checkedButSourceMissing,
    checkedEvidenceGates,
    missingEvidenceManifestExpectations
  }
};

console.log(JSON.stringify(report, null, 2));

if (
  sourceBackedUnchecked.length > 0 ||
  checkedButSourceMissing.length > 0 ||
  checkedEvidenceGates.length > 0 ||
  missingEvidenceManifestExpectations.length > 0
) {
  process.exitCode = 1;
}

function sourceStatus(entry: SourceBackedCheckbox): SourceBackedStatus {
  const checkbox = checkboxes.find((candidate) => candidate.text === entry.text);
  const sources = entry.source.map((requirement): SourceStatus => {
    const content = read(requirement.file);
    const exists = content.length > 0 || existsSync(resolve(root, requirement.file));
    const missingTokens = exists ? requirement.tokens.filter((token) => !content.includes(token)) : requirement.tokens;
    return {
      ...requirement,
      exists,
      missingTokens
    };
  });

  return {
    ...entry,
    checkbox,
    checked: checkbox?.state === "checked",
    sourceBacked: sources.every((source) => source.exists && source.missingTokens.length === 0),
    sources
  };
}

function evidenceStatus(entry: EvidenceGate): EvidenceGateStatus {
  const checkbox = checkboxes.find((candidate) => candidate.text === entry.text);
  return {
    ...entry,
    checkbox,
    checked: checkbox?.state === "checked"
  };
}

function evidenceManifestStatus(entry: EvidenceManifestRequirement): EvidenceManifestStatus {
  const content = read(entry.file);
  const exists = content.length > 0 || existsSync(resolve(root, entry.file));
  const missingTokens = exists ? entry.tokens.filter((token) => !content.includes(token)) : entry.tokens;
  let parsed: Record<string, unknown> | undefined;
  let parseError: string | undefined;

  if (content.length > 0) {
    try {
      parsed = asRecord(JSON.parse(content));
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
  }

  const manifestKind = typeof parsed?.kind === "string" ? parsed.kind : undefined;
  const requiredProofs = Array.isArray(parsed?.requiredProofs) ? parsed.requiredProofs : [];
  const proofIdsFound = requiredProofs
    .map((proof) => asRecord(proof)?.proofId)
    .filter((proofId): proofId is string => typeof proofId === "string");
  const missingProofIds = exists ? entry.proofIds.filter((proofId) => !proofIdsFound.includes(proofId)) : entry.proofIds;

  return {
    ...entry,
    exists,
    manifestKind,
    kindMatched: manifestKind === entry.kind,
    parseError,
    proofIdsFound,
    missingTokens,
    missingProofIds
  };
}

function read(file: string): string {
  const path = resolve(root, file);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
