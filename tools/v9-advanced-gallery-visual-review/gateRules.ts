export type VisualReviewStatus = "failed" | "candidate" | "accepted";

export interface VisualReviewMetadataForGate {
  readonly status: VisualReviewStatus;
  readonly screenshot: string;
  readonly screenshotSha256?: string;
  readonly reviewedBy?: string;
  readonly reviewedAt?: string;
  readonly notes: string;
  readonly knownGaps: readonly string[];
}

export interface VisualReviewAcceptedRuntimeGateInput extends VisualReviewMetadataForGate {
  readonly demoId: string;
  readonly runtime?: {
    readonly fps?: number;
    readonly frameMs?: number;
    readonly approximations?: readonly string[];
    readonly dataGalaxyEvidence?: DataGalaxyRuntimeGateEvidence;
  };
  readonly authored?: {
    readonly drawItems?: number;
    readonly assetIds?: readonly string[];
    readonly materialDiagnostics?: readonly MaterialDiagnosticGateEvidence[];
  };
  readonly pngStats?: {
    readonly foregroundBoundsCoverage?: number;
    readonly detailEdgeDensity?: number;
    readonly localContrast?: number;
  };
  readonly dataGalaxyEvidence?: DataGalaxyRuntimeGateEvidence;
  readonly performanceEvidence?: VisualReviewPerformanceEvidence;
}

export interface VisualReviewPerformanceEvidence {
  readonly acceptanceUsesRafFrameMs?: boolean;
  readonly loopMs?: number;
  readonly renderMs?: number;
  readonly budgetMs?: number;
  readonly loopWithinBudget?: boolean;
  readonly renderWithinBudget?: boolean;
}

export interface MaterialDiagnosticGateEvidence {
  readonly assetId?: string;
  readonly drawItems?: number;
  readonly texturedDrawItems?: number;
  readonly baseColorTextureDrawItems?: number;
  readonly colorBearingTextureDrawItems?: number;
  readonly surfaceDetailTextureDrawItems?: number;
  readonly effectiveTextureBackedDrawItems?: number;
  readonly fallbackWhiteDrawItems?: number;
  readonly missingGeometryDrawItems?: number;
  readonly missingMaterialDrawItems?: number;
}

export interface DataGalaxyRuntimeGateEvidence {
  readonly updateMode?: string;
  readonly gpuBackend?: {
    readonly supported?: boolean;
    readonly backend?: string;
    readonly nativeGpuComputeDispatches?: number;
  };
  readonly focalHierarchy?: {
    readonly centralSubject?: string;
    readonly primaryLayerRole?: string;
    readonly supportLayerRole?: string;
    readonly authoredGlbRole?: string;
  };
  readonly authoredAssetDisclosure?: {
    readonly activeGeneratedAssetIds?: readonly string[];
    readonly generatedNoTextureAuthoredGlb?: boolean;
    readonly premiumTextureBackedAuthoredHero?: boolean;
    readonly supportOnlyUntilVisualReview?: boolean;
  };
}

export function acceptedMetadataBlockers(input: VisualReviewMetadataForGate): string[] {
  if (input.status !== "accepted") {
    return [`Screenshot is marked ${input.status}, not accepted; smoke/runtime pass is not visual acceptance.`];
  }

  const blockers: string[] = [];
  if (!isAdvancedGalleryScreenshotPath(input.screenshot)) {
    blockers.push("Accepted review screenshot must live under tests/reports/v9/advanced-examples-gallery and be a PNG.");
  }
  if (!input.screenshotSha256) {
    blockers.push("Accepted review is missing screenshotSha256.");
  }
  if (input.screenshotSha256 && !/^[a-f0-9]{64}$/.test(input.screenshotSha256)) {
    blockers.push("Accepted review screenshotSha256 is not a lowercase SHA-256 hex digest.");
  }
  if (!input.reviewedBy) {
    blockers.push("Accepted review is missing reviewedBy.");
  }
  if (input.reviewedBy && input.reviewedBy.trim().length < 2) {
    blockers.push("Accepted review reviewedBy is too short to identify a reviewer.");
  }
  if (!input.reviewedAt) {
    blockers.push("Accepted review is missing reviewedAt.");
  }
  if (input.reviewedAt && !isValidIsoTimestamp(input.reviewedAt)) {
    blockers.push("Accepted review reviewedAt must be a valid ISO timestamp.");
  }
  if (input.notes.trim().length < 48) {
    blockers.push("Accepted review notes are too short to be a detailed human verdict.");
  }
  if (/\b(candidate|failed|scaffold|not accepted)\b/i.test(input.notes)) {
    blockers.push("Accepted review notes still contain rejection language.");
  }
  if (!/\b(three\.?js|reference|comparable|parity|accepted)\b/i.test(input.notes)) {
    blockers.push("Accepted review notes must mention the comparison basis.");
  }
  if (input.knownGaps.length <= 0) {
    blockers.push("Accepted review metadata must keep knownGaps populated with unsupported boundaries or an explicit no-known-gaps statement.");
  }
  if (input.knownGaps.length > 0 && !/\b(unsupported|known gap|known limit|bounded|approximation|approximated|not supported|no native|no true|not full)\b/i.test(input.notes)) {
    blockers.push("Accepted review notes must explicitly acknowledge known gaps, unsupported boundaries, or scoped approximations.");
  }
  return blockers;
}

export function acceptedRuntimeEvidenceBlockers(input: VisualReviewAcceptedRuntimeGateInput): string[] {
  if (input.status !== "accepted") return [];

  const blockers: string[] = [];
  const reviewText = [input.notes, ...input.knownGaps, ...(input.runtime?.approximations ?? [])].join("\n");
  blockers.push(...acceptedCadenceBlockers(input.demoId, input.runtime, input.performanceEvidence));
  blockers.push(...acceptedMaterialBlockers(input.demoId, input.authored));
  blockers.push(...acceptedScaffoldDominanceBlockers(input.demoId, input.authored, input.dataGalaxyEvidence ?? input.runtime?.dataGalaxyEvidence, reviewText));
  blockers.push(...acceptedCropArtifactBlockers(input.demoId, input.pngStats, reviewText));
  blockers.push(...acceptedVisualQualityMetricBlockers(input.demoId, input.pngStats));
  blockers.push(...acceptedGeneratedOverclaimBlockers(input.demoId, input.authored, input.dataGalaxyEvidence ?? input.runtime?.dataGalaxyEvidence, reviewText));
  return blockers;
}

export function isAdvancedGalleryScreenshotPath(path: string): boolean {
  return /^tests\/reports\/v9\/advanced-examples-gallery\/.+\.png$/i.test(path);
}

export function isValidIsoTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function acceptedCadenceBlockers(
  demoId: string,
  runtime: VisualReviewAcceptedRuntimeGateInput["runtime"],
  performanceEvidence: VisualReviewAcceptedRuntimeGateInput["performanceEvidence"]
): string[] {
  const blockers: string[] = [];
  const fps = runtime?.fps;
  const frameMs = runtime?.frameMs;
  if (!isFiniteNumber(fps)) blockers.push(`${demoId} accepted review is missing finite runtime FPS cadence evidence.`);
  if (!isFiniteNumber(frameMs)) blockers.push(`${demoId} accepted review is missing finite runtime frameMs cadence evidence.`);
  if (performanceEvidence?.acceptanceUsesRafFrameMs === false) {
    if (performanceEvidence.loopWithinBudget !== true) {
      blockers.push(`${demoId} accepted review measured loop work ${performanceEvidence.loopMs ?? "missing"}ms is not within the ${performanceEvidence.budgetMs ?? "missing"}ms presentation budget.`);
    }
    if (performanceEvidence.renderWithinBudget !== true) {
      blockers.push(`${demoId} accepted review measured render work ${performanceEvidence.renderMs ?? "missing"}ms is not within the ${performanceEvidence.budgetMs ?? "missing"}ms presentation budget.`);
    }
    return blockers;
  }
  if (isFiniteNumber(fps) && fps < 12) blockers.push(`${demoId} accepted review FPS cadence ${fps} is below the 12 FPS presentation floor.`);
  if (isFiniteNumber(frameMs) && frameMs > 1000 / 12) blockers.push(`${demoId} accepted review frameMs cadence ${frameMs} exceeds the 12 FPS presentation ceiling.`);
  return blockers;
}

function acceptedMaterialBlockers(demoId: string, authored: VisualReviewAcceptedRuntimeGateInput["authored"]): string[] {
  const diagnostics = authored?.materialDiagnostics ?? [];
  const authoredDrawItems = finiteOrZero(authored?.drawItems) || diagnostics.reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.drawItems), 0);
  const blockers: string[] = [];
  if (authoredDrawItems > 0 && diagnostics.length === 0) {
    blockers.push(`${demoId} accepted authored GLB evidence has draw items but no material diagnostics.`);
  }
  const fallbackWhite = diagnostics.reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.fallbackWhiteDrawItems), 0);
  const missingGeometry = diagnostics.reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.missingGeometryDrawItems), 0);
  const missingMaterial = diagnostics.reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.missingMaterialDrawItems), 0);
  if (fallbackWhite > 0) blockers.push(`${demoId} accepted authored GLB evidence still has ${fallbackWhite} fallback/default white material draw items.`);
  if (missingGeometry > 0) blockers.push(`${demoId} accepted authored GLB evidence still has ${missingGeometry} missing geometry draw items.`);
  if (missingMaterial > 0) blockers.push(`${demoId} accepted authored GLB evidence still has ${missingMaterial} missing material draw items.`);
  if (demoId === "product-configurator") {
    const nonStudioDiagnostics = diagnostics.filter((diagnostic) =>
      diagnostic.assetId !== "product-configurator-studio-blender"
      && !/studio|support|scaffold/i.test(diagnostic.assetId ?? "")
      && finiteOrZero(diagnostic.drawItems) > 0
    );
    const missingEffectiveDiagnostics = nonStudioDiagnostics
      .filter((diagnostic) => diagnostic.effectiveTextureBackedDrawItems === undefined)
      .map((diagnostic) => diagnostic.assetId ?? "unknown");
    const effectiveDrawItems = nonStudioDiagnostics.reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.effectiveTextureBackedDrawItems), 0);
    const colorBearingDrawItems = nonStudioDiagnostics.reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.colorBearingTextureDrawItems), 0);
    if (authoredDrawItems > 0 && missingEffectiveDiagnostics.length > 0) {
      blockers.push(`product-configurator accepted review is missing effective texture-contribution diagnostics for non-studio product GLBs (${missingEffectiveDiagnostics.join(", ")}); broad texturedDrawItems cannot carry acceptance.`);
    }
    if (nonStudioDiagnostics.length > 0 && effectiveDrawItems <= 0) {
      blockers.push("product-configurator accepted review has no effective texture-backed non-studio product material evidence; broad texture bindings cannot carry acceptance.");
    }
    if (nonStudioDiagnostics.length > 0 && colorBearingDrawItems <= 0) {
      blockers.push("product-configurator accepted review has no color-bearing texture contribution on non-studio product GLBs; scalar/detail-only texture bindings cannot carry acceptance.");
    }
  }
  return blockers;
}

function acceptedScaffoldDominanceBlockers(
  demoId: string,
  authored: VisualReviewAcceptedRuntimeGateInput["authored"],
  dataGalaxyEvidence: DataGalaxyRuntimeGateEvidence | undefined,
  reviewText: string
): string[] {
  const diagnostics = authored?.materialDiagnostics ?? [];
  const totalDrawItems = finiteOrZero(authored?.drawItems) || diagnostics.reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.drawItems), 0);
  if (totalDrawItems <= 0) return [];
  const blockers: string[] = [];

  if (demoId === "product-configurator") {
    const supportDrawItems = diagnostics
      .filter((diagnostic) => diagnostic.assetId === "product-configurator-studio-blender" || /studio|support|scaffold/i.test(diagnostic.assetId ?? ""))
      .reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.drawItems), 0);
    const noTextureDrawItems = diagnostics
      .filter((diagnostic) => finiteOrZero(diagnostic.drawItems) > 0 && finiteOrZero(diagnostic.texturedDrawItems) <= 0)
      .reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.drawItems), 0);
    if (supportDrawItems / totalDrawItems > 0.35) {
      blockers.push(`product-configurator accepted review has support/scaffold draw-item dominance (${supportDrawItems}/${totalDrawItems}); generated studio support cannot carry product acceptance.`);
    }
    if (noTextureDrawItems / totalDrawItems > 0.25) {
      blockers.push(`product-configurator accepted review has no-texture authored draw-item dominance (${noTextureDrawItems}/${totalDrawItems}); support/no-texture fixtures cannot carry product acceptance.`);
    }
  }

  if (demoId === "data-galaxy") {
    const generatedDrawItems = diagnostics
      .filter((diagnostic) => diagnostic.assetId === "data-galaxy-core-blender" || /generated|scaffold|core-blender/i.test(diagnostic.assetId ?? ""))
      .reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.drawItems), 0);
    const generatedTexturedDrawItems = diagnostics
      .filter((diagnostic) => diagnostic.assetId === "data-galaxy-core-blender" || /generated|scaffold|core-blender/i.test(diagnostic.assetId ?? ""))
      .reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.texturedDrawItems), 0);
    const generatedEffectiveTextureDrawItems = diagnostics
      .filter((diagnostic) => diagnostic.assetId === "data-galaxy-core-blender" || /generated|scaffold|core-blender/i.test(diagnostic.assetId ?? ""))
      .reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.effectiveTextureBackedDrawItems), 0);
    const disclosedAsProceduralSupport = /\b(procedural|particle)\b/i.test(reviewText) && /\b(support-only|support only|not.*premium|not.*hero|generated|texture-backed support|support fixture)\b/i.test(reviewText);
    const generatedDisclosure = dataGalaxyEvidence?.authoredAssetDisclosure;
    if (generatedDrawItems / totalDrawItems > 0.5 && !disclosedAsProceduralSupport) {
      blockers.push(`data-galaxy accepted review has generated/scaffold authored draw-item dominance (${generatedDrawItems}/${totalDrawItems}) without a procedural/support-only acceptance boundary.`);
    }
    if (generatedDrawItems / totalDrawItems > 0.5) {
      blockers.push(`data-galaxy accepted review has generated/support authored draw-item dominance (${generatedDrawItems}/${totalDrawItems}); support-only authored GLBs must stay subordinate to particle/data-system proof.`);
    }
    if (generatedDrawItems > 0 && generatedTexturedDrawItems > 0 && generatedEffectiveTextureDrawItems <= 0) {
      blockers.push(`data-galaxy accepted review has generated authored GLB broad texture bindings (${generatedTexturedDrawItems} draw items) but zero effective texture-contribution draw items.`);
    }
    if (generatedDisclosure?.premiumTextureBackedAuthoredHero === false
      && generatedDisclosure.supportOnlyUntilVisualReview === true
      && generatedDrawItems / totalDrawItems > 0.5
      && generatedEffectiveTextureDrawItems / Math.max(1, generatedDrawItems) < 0.1) {
      blockers.push(`data-galaxy accepted review has generated support GLB dominance (${generatedDrawItems}/${totalDrawItems}) while only ${generatedEffectiveTextureDrawItems} draw items have effective texture contribution.`);
    }
    if (generatedDisclosure?.generatedNoTextureAuthoredGlb === true
      && generatedDisclosure.premiumTextureBackedAuthoredHero === false
      && !disclosedAsProceduralSupport) {
      blockers.push("data-galaxy accepted review uses generated/no-texture authored GLB evidence without explicitly accepting it as support-only procedural context.");
    }
    const authoredGlbRole = dataGalaxyEvidence?.focalHierarchy?.authoredGlbRole ?? "";
    if (generatedDisclosure?.generatedNoTextureAuthoredGlb === true
      && generatedDisclosure.premiumTextureBackedAuthoredHero === false
      && /\b(hero|focal|premium|primary|acceptance proof|accepted proof)\b/i.test(authoredGlbRole)) {
      blockers.push("data-galaxy accepted review uses generated/no-texture authored GLB as focal or premium proof; current disclosure only allows support-only context.");
    }
  }

  return blockers;
}

function acceptedCropArtifactBlockers(
  demoId: string,
  pngStats: VisualReviewAcceptedRuntimeGateInput["pngStats"],
  reviewText: string
): string[] {
  const cropRisk = /\b(crop|cropped|clipped|cut off|cut-off|boundary|stage artifact|slab artifact|gray slab|grey slab|stage board|edge artifact|transparent-card silhouette|slab dominance|stage dominance|studio-board dominance|oversized floor slab|floor slab dominates)\b/i.test(reviewText);
  if (!cropRisk) return [];
  const blockers = [`${demoId} accepted review metadata still mentions crop, clipping, boundary, or stage-edge artifact risk.`];
  const boundsCoverage = pngStats?.foregroundBoundsCoverage;
  if (isFiniteNumber(boundsCoverage) && boundsCoverage > 0.98) {
    blockers.push(`${demoId} accepted screenshot foregroundBoundsCoverage ${boundsCoverage} is pinned to the frame while crop/boundary risk is documented.`);
  }
  return blockers;
}

function acceptedVisualQualityMetricBlockers(
  demoId: string,
  pngStats: VisualReviewAcceptedRuntimeGateInput["pngStats"]
): string[] {
  const blockers: string[] = [];
  const localContrast = pngStats?.localContrast;
  const detailEdgeDensity = pngStats?.detailEdgeDensity;

  if (demoId === "product-configurator" && isFiniteNumber(localContrast) && localContrast < 30) {
    blockers.push(`${demoId} accepted screenshot localContrast ${localContrast} is below the 30 smooth-product visual floor.`);
  }
  if (demoId === "data-galaxy" && isFiniteNumber(localContrast) && localContrast < 35) {
    blockers.push(`${demoId} accepted screenshot localContrast ${localContrast} is below the 35 premium visual floor.`);
  }
  if (demoId === "product-configurator" && isFiniteNumber(detailEdgeDensity) && detailEdgeDensity < 0.007) {
    blockers.push(`product-configurator accepted screenshot detailEdgeDensity ${detailEdgeDensity} is below the 0.007 smooth-product material/detail floor.`);
  }
  return blockers;
}

function acceptedGeneratedOverclaimBlockers(
  demoId: string,
  authored: VisualReviewAcceptedRuntimeGateInput["authored"],
  dataGalaxyEvidence: DataGalaxyRuntimeGateEvidence | undefined,
  reviewText: string
): string[] {
  const blockers: string[] = [];
  const activeAssetIds = new Set([
    ...(authored?.assetIds ?? []),
    ...(dataGalaxyEvidence?.authoredAssetDisclosure?.activeGeneratedAssetIds ?? [])
  ]);
  const generatedAssetActive = [...activeAssetIds].some((assetId) => /generated|studio-blender|core-blender|batched|scaffold/i.test(assetId));
  if (generatedAssetActive && !/\b(generated|support-only|support only|no-texture|untextured|derivative|not.*premium|not.*hero)\b/i.test(reviewText)) {
    blockers.push(`${demoId} accepted review has active generated/derivative/support assets without explicit generated/support disclosure.`);
  }

  const claimsGpuParity = /\b(GPGPU|GPU compute|WebGPU particles?|compute particles?|native GPU)\b/i.test(inputTextWithoutNegatedGpuDisclosure(reviewText));
  const reportsNoGpu = dataGalaxyEvidence?.gpuBackend?.nativeGpuComputeDispatches === 0
    || dataGalaxyEvidence?.gpuBackend?.supported === false
    || /\bCPU\/static|static-geometry|0 native GPU compute dispatches|no native GPU\b/i.test(reviewText);
  if (demoId === "data-galaxy" && claimsGpuParity && reportsNoGpu) {
    blockers.push("data-galaxy accepted review claims GPU/GPGPU particle capability while runtime evidence reports CPU/static particles and 0 native GPU compute dispatches.");
  }
  return blockers;
}

function inputTextWithoutNegatedGpuDisclosure(value: string): string {
  return value
    .replace(/\b(no|not|without|zero|0)\s+(?:native\s+)?(?:GPU|GPGPU|WebGPU|compute)[^\n.;]*/gi, "")
    .replace(/\b0 native GPU compute dispatches\b/gi, "");
}

function finiteOrZero(value: unknown): number {
  return isFiniteNumber(value) ? value : 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
