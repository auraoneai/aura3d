// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraCustomGeometrySpec } from "../RootGeometry.js";
import type { AuraPrimitiveOptions } from "./types.js";
import { defineAuraCustomGeometry } from "../RootGeometry.js";
import { primitive } from "./primitives.js";
import { lazyNamespace } from "../lazyNamespace.js";


export const geometry = lazyNamespace(() => ({
  define: defineAuraCustomGeometry,
  custom: (spec: AuraCustomGeometrySpec, options: Omit<AuraPrimitiveOptions, "geometry"> = {}) => primitive("custom", { ...options, geometry: defineAuraCustomGeometry(spec) })
} as const));
