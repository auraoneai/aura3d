import {
  createPromptAnimationIssue,
  promptAnimationContractVersion,
  type PromptAnimationFrameRate,
  type PromptAnimationId,
  type PromptAnimationSeconds,
  type PromptAnimationValidationIssue
} from "./PromptAnimationContract.js";

export const cartoonRouteProofSchemaVersion = "aura3d-cartoon-route-proof/v1" as const;

export type CartoonRouteProofStatus = "pass" | "fail";

export interface CartoonRouteProofAsset {
  readonly id: PromptAnimationId;
  readonly role: "character" | "set" | "prop" | "audio" | "other";
  readonly typedAsset: boolean;
  readonly source: "aura-assets" | "placeholder" | "runtime-generated" | "unknown";
  readonly url?: string | undefined;
  readonly checksum?: string | undefined;
  readonly ready: boolean;
  readonly issues?: readonly string[] | undefined;
}

export interface CartoonRouteProofShot {
  readonly id: PromptAnimationId;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
  readonly expectedCharacterIds: readonly PromptAnimationId[];
  readonly visibleCharacterIds: readonly PromptAnimationId[];
  readonly captionIds: readonly PromptAnimationId[];
  readonly gestureIds: readonly PromptAnimationId[];
  readonly visemeCueIds: readonly PromptAnimationId[];
  readonly nonblank: boolean;
  readonly frameCount: number;
  readonly frameHashes: readonly string[];
}

export interface CartoonRouteProofCaption {
  readonly id: PromptAnimationId;
  readonly lineId?: PromptAnimationId | undefined;
  readonly text: string;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
  readonly rendered: boolean;
}

export interface CartoonRouteProofViseme {
  readonly id: PromptAnimationId;
  readonly characterId: PromptAnimationId;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
  readonly mode: "blendshape-lip-sync" | "primitive-mouth-card" | "amplitude-only" | "manual" | "missing-mouth-motion";
  readonly rendered: boolean;
}

export interface CartoonRouteProofGesture {
  readonly id: PromptAnimationId;
  readonly characterId: PromptAnimationId;
  readonly state: string;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
  readonly rendered: boolean;
}

export interface CartoonRouteProofRenderState {
  readonly frameCount: number;
  readonly nonblank: boolean;
  readonly sourceOnly?: boolean | undefined;
  readonly notTrue3D?: boolean | undefined;
  readonly debugOverlaysVisible?: boolean | undefined;
  readonly routeChromeVisible?: boolean | undefined;
}

export interface CartoonRouteProofPlaybackState {
  readonly canPlay: boolean;
  readonly canPause: boolean;
  readonly canScrub: boolean;
  readonly canJumpShots: boolean;
  readonly captionsToggle: boolean;
  readonly muteToggle: boolean;
  readonly reducedMotion: boolean;
  readonly reducedFlash: boolean;
}

export interface CartoonRouteReadinessCheck {
  readonly id: string;
  readonly passed: boolean;
  readonly message: string;
}

export interface CartoonRouteProof {
  readonly artifact: "cartoon-route-proof";
  readonly schemaVersion: typeof cartoonRouteProofSchemaVersion;
  readonly contractId: string;
  readonly episodeId: PromptAnimationId;
  readonly generatedAt?: string | undefined;
  readonly route: string;
  readonly duration: PromptAnimationSeconds;
  readonly frameRate: PromptAnimationFrameRate;
  readonly assets: readonly CartoonRouteProofAsset[];
  readonly shots: readonly CartoonRouteProofShot[];
  readonly captions: readonly CartoonRouteProofCaption[];
  readonly visemes: readonly CartoonRouteProofViseme[];
  readonly gestures: readonly CartoonRouteProofGesture[];
  readonly render: CartoonRouteProofRenderState;
  readonly playback: CartoonRouteProofPlaybackState;
  readonly routeErrors: readonly string[];
  readonly checks: readonly CartoonRouteReadinessCheck[];
  readonly issues: readonly PromptAnimationValidationIssue[];
  readonly status: CartoonRouteProofStatus;
}

export interface CreateCartoonRouteProofInput {
  readonly episodeId: PromptAnimationId;
  readonly route: string;
  readonly duration: PromptAnimationSeconds;
  readonly frameRate: PromptAnimationFrameRate;
  readonly generatedAt?: string | undefined;
  readonly assets: readonly CartoonRouteProofAsset[];
  readonly shots: readonly CartoonRouteProofShot[];
  readonly captions?: readonly CartoonRouteProofCaption[] | undefined;
  readonly visemes?: readonly CartoonRouteProofViseme[] | undefined;
  readonly gestures?: readonly CartoonRouteProofGesture[] | undefined;
  readonly render: CartoonRouteProofRenderState;
  readonly playback: CartoonRouteProofPlaybackState;
  readonly routeErrors?: readonly string[] | undefined;
}

export function createCartoonRouteProof(input: CreateCartoonRouteProofInput): CartoonRouteProof {
  const checks = createCartoonRouteReadinessChecks(input);
  const issues = checks
    .filter((check) => !check.passed)
    .map((check) => createPromptAnimationIssue("error", `cartoon-route-${check.id}`, check.message));
  for (const error of input.routeErrors ?? []) {
    issues.push(createPromptAnimationIssue("error", "cartoon-route-error", error));
  }

  return {
    artifact: "cartoon-route-proof",
    schemaVersion: cartoonRouteProofSchemaVersion,
    contractId: promptAnimationContractVersion,
    episodeId: input.episodeId,
    generatedAt: input.generatedAt,
    route: input.route,
    duration: input.duration,
    frameRate: input.frameRate,
    assets: input.assets,
    shots: input.shots,
    captions: input.captions ?? [],
    visemes: input.visemes ?? [],
    gestures: input.gestures ?? [],
    render: input.render,
    playback: input.playback,
    routeErrors: input.routeErrors ?? [],
    checks,
    issues,
    status: issues.some((issue) => issue.severity === "error") ? "fail" : "pass"
  };
}

export function validateCartoonRouteProof(proof: CartoonRouteProof): readonly PromptAnimationValidationIssue[] {
  const issues: PromptAnimationValidationIssue[] = [];
  if (proof.schemaVersion !== cartoonRouteProofSchemaVersion) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "cartoon-route-proof-schema-version-unknown",
        `Unknown cartoon route proof schema "${proof.schemaVersion}".`
      )
    );
  }
  if (proof.status !== "pass") {
    issues.push(createPromptAnimationIssue("error", "cartoon-route-proof-status-fail", "Cartoon route proof did not pass."));
  }
  return [...issues, ...proof.issues];
}

function createCartoonRouteReadinessChecks(input: CreateCartoonRouteProofInput): readonly CartoonRouteReadinessCheck[] {
  const characterAssets = input.assets.filter((asset) => asset.role === "character");
  const setAssets = input.assets.filter((asset) => asset.role === "set");
  const typedAssetFailures = input.assets.filter((asset) => !asset.typedAsset || !asset.ready || asset.source !== "aura-assets");
  const missingShotCharacters = input.shots.flatMap((shot) =>
    shot.expectedCharacterIds.filter((characterId) => !shot.visibleCharacterIds.includes(characterId)).map((characterId) => ({
      shotId: shot.id,
      characterId
    }))
  );
  const missingRenderedCaptions = (input.captions ?? []).filter((caption) => !caption.rendered);
  const missingRenderedVisemes = (input.visemes ?? []).filter((viseme) => !viseme.rendered || viseme.mode === "missing-mouth-motion");
  const missingRenderedGestures = (input.gestures ?? []).filter((gesture) => !gesture.rendered);

  return [
    {
      id: "route-present",
      passed: input.route.length > 0,
      message: "Cartoon route URL/path is required."
    },
    {
      id: "typed-character-assets",
      passed: characterAssets.length >= 2 && typedAssetFailures.filter((asset) => asset.role === "character").length === 0,
      message: "Route proof requires at least two ready typed character assets from aura-assets."
    },
    {
      id: "typed-set-assets",
      passed: setAssets.length >= 1 && typedAssetFailures.filter((asset) => asset.role === "set").length === 0,
      message: "Route proof requires at least one ready typed set asset from aura-assets."
    },
    {
      id: "shots-present",
      passed: input.shots.length > 0,
      message: "Route proof requires at least one shot."
    },
    {
      id: "shot-characters-visible",
      passed: missingShotCharacters.length === 0,
      message: `Expected characters must be visible in every shot; ${missingShotCharacters.length} missing visibility records.`
    },
    {
      id: "shot-nonblank",
      passed: input.shots.every((shot) => shot.nonblank && shot.frameCount > 0),
      message: "Every shot must be nonblank and contain sampled frames."
    },
    {
      id: "captions-rendered",
      passed: (input.captions?.length ?? 0) > 0 && missingRenderedCaptions.length === 0,
      message: "Route proof requires rendered captions."
    },
    {
      id: "visemes-rendered",
      passed: (input.visemes?.length ?? 0) > 0 && missingRenderedVisemes.length === 0,
      message: "Route proof requires rendered viseme or mouth-motion cues."
    },
    {
      id: "gestures-rendered",
      passed: (input.gestures?.length ?? 0) > 0 && missingRenderedGestures.length === 0,
      message: "Route proof requires rendered character gestures."
    },
    {
      id: "render-nonblank",
      passed: input.render.nonblank && input.render.frameCount > 0,
      message: "Route render state must be nonblank and have frames."
    },
    {
      id: "not-source-only",
      passed: input.render.sourceOnly !== true && input.render.notTrue3D !== true,
      message: "Source-only or not-true-3D routes cannot satisfy 1.1 cartoon route proof."
    },
    {
      id: "no-export-overlays",
      passed: input.render.debugOverlaysVisible !== true && input.render.routeChromeVisible !== true,
      message: "Export route proof must not include debug overlays or route chrome."
    },
    {
      id: "playback-controls",
      passed: input.playback.canPlay && input.playback.canPause && input.playback.canScrub && input.playback.canJumpShots,
      message: "Route proof requires play, pause, scrub, and shot-jump controls."
    },
    {
      id: "route-errors",
      passed: (input.routeErrors?.length ?? 0) === 0,
      message: "Route proof must have no route errors."
    }
  ];
}
