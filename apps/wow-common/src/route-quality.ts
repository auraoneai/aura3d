export interface RouteRenderQualityDefaults {
  readonly maxPixelRatio: number;
  readonly maxRenderEdge: number;
}

export interface RouteRenderQuality {
  readonly maxPixelRatio: number;
  readonly maxRenderEdge: number;
}

export function routeChromeHidden(): boolean {
  const params = typeof location !== "undefined"
    ? new URLSearchParams(location.search)
    : new URLSearchParams();
  return params.get("chrome") === "hidden";
}

export function applyRouteChromeMode(): boolean {
  const hidden = routeChromeHidden();
  if (hidden && typeof document !== "undefined") {
    document.documentElement.setAttribute("data-chrome", "hidden");
  }
  return hidden;
}

export function routeRenderQuality(defaults: RouteRenderQualityDefaults): RouteRenderQuality {
  const params = typeof location !== "undefined"
    ? new URLSearchParams(location.search)
    : new URLSearchParams();
  const preset = params.get("quality");
  let maxPixelRatio = defaults.maxPixelRatio;
  let maxRenderEdge = defaults.maxRenderEdge;

  if (preset === "marketing" || preset === "preview") {
    maxPixelRatio = Math.min(maxPixelRatio, 1);
    maxRenderEdge = Math.min(maxRenderEdge, 1440);
  } else if (preset === "thumbnail") {
    maxPixelRatio = Math.min(maxPixelRatio, 1);
    maxRenderEdge = Math.min(maxRenderEdge, 960);
  }

  maxPixelRatio = finitePositive(params.get("maxPixelRatio"), maxPixelRatio);
  maxRenderEdge = finitePositive(params.get("maxRenderEdge"), maxRenderEdge);
  return { maxPixelRatio, maxRenderEdge };
}

function finitePositive(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}
