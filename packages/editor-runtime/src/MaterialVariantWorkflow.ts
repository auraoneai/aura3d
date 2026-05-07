export interface MaterialVariantState {
  readonly assetId: string;
  readonly variants: readonly string[];
  readonly selected: string | null;
}

export interface MaterialVariantRenderOptions {
  readonly materialVariant?: string;
}

export class MaterialVariantWorkflow {
  private readonly states = new Map<string, MaterialVariantState>();

  register(assetId: string, variants: readonly string[], selected: string | null = null): MaterialVariantState {
    const normalizedAssetId = normalizeAssetId(assetId);
    const normalizedVariants = normalizeVariants(variants);
    const normalizedSelected = selected === null ? null : normalizeVariantName(selected);
    if (normalizedSelected !== null && !normalizedVariants.includes(normalizedSelected)) {
      throw new Error(`Material variant ${normalizedSelected} is not available for asset ${normalizedAssetId}.`);
    }
    const state = {
      assetId: normalizedAssetId,
      variants: normalizedVariants,
      selected: normalizedSelected
    };
    this.states.set(normalizedAssetId, state);
    return state;
  }

  unregister(assetId: string): void {
    this.states.delete(normalizeAssetId(assetId));
  }

  select(assetId: string, variant: string | null): MaterialVariantState {
    const normalizedAssetId = normalizeAssetId(assetId);
    const state = this.states.get(normalizedAssetId);
    if (!state) {
      throw new Error(`Material variant asset ${normalizedAssetId} is not registered.`);
    }
    const selected = variant === null ? null : normalizeVariantName(variant);
    if (selected !== null && !state.variants.includes(selected)) {
      throw new Error(`Material variant ${selected} is not available for asset ${normalizedAssetId}.`);
    }
    const next = { ...state, selected };
    this.states.set(normalizedAssetId, next);
    return next;
  }

  state(assetId: string): MaterialVariantState {
    const normalizedAssetId = normalizeAssetId(assetId);
    const state = this.states.get(normalizedAssetId);
    if (!state) {
      throw new Error(`Material variant asset ${normalizedAssetId} is not registered.`);
    }
    return state;
  }

  snapshot(): readonly MaterialVariantState[] {
    return [...this.states.values()].map((state) => ({
      assetId: state.assetId,
      variants: [...state.variants],
      selected: state.selected
    }));
  }

  renderOptions(assetId: string): MaterialVariantRenderOptions {
    const selected = this.state(assetId).selected;
    return selected === null ? {} : { materialVariant: selected };
  }

  clear(): void {
    this.states.clear();
  }
}

function normalizeAssetId(assetId: string): string {
  const normalized = assetId.trim();
  if (normalized.length === 0) {
    throw new Error("Material variant asset id cannot be empty.");
  }
  return normalized;
}

function normalizeVariantName(variant: string): string {
  const normalized = variant.trim();
  if (normalized.length === 0) {
    throw new Error("Material variant name cannot be empty.");
  }
  return normalized;
}

function normalizeVariants(variants: readonly string[]): readonly string[] {
  if (variants.length === 0) {
    throw new Error("Material variant list cannot be empty.");
  }
  const normalized = variants.map(normalizeVariantName);
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("Material variant list cannot contain duplicate names.");
  }
  return normalized;
}
