/**
 * Orchestrated candidate screening pipeline.
 *
 * ## Why an orchestrator rather than a documented procedure
 *
 * The individual capabilities exist: search, `--index`/`--candidate-id` selection, geometry auditing,
 * isolated render probes, role-aware admission, registration and typegen. What did not exist was
 * anything that *runs them in order and keeps the record*. In practice that meant a human ran a few
 * steps by hand, formed an impression, and moved on -- which is exactly how three unusable hero vehicles
 * shipped in a row, and how I once concluded "the catalog has no suitable props" without having searched
 * it.
 *
 * The pipeline's real product is therefore not the accepted asset. It is the **retained record of every
 * candidate and why it was rejected**. An accepted asset with no record of its rivals cannot be
 * reviewed, and a rejection with no reason cannot be learned from.
 *
 * ## Stages
 *
 * search -> enumerate -> select -> pull -> inspect geometry -> render probe -> score role fitness ->
 * reject with machine-readable reasons -> rank accepted -> register durably -> typegen -> certify.
 *
 * ## Deliberate injection seams
 *
 * Every external effect (search, pull, geometry inspection, render probe, register) is injected. That is
 * not test convenience: a render probe needs a browser and a pull needs the network, so a pipeline that
 * hardcoded them could only ever be tested by running the whole thing. Injection lets the *ordering and
 * record-keeping logic* -- the part that failed before -- be tested deterministically and offline.
 */

import {
  admitAssetForRole,
  type AssetAdmissionReport,
  type AssetGeometryFacts,
  type AssetProvenanceFacts,
  type AssetRenderedFacts
} from "./asset-role-admission.js";
import {
  admissionRequirementForIntent,
  licenseSatisfiesPolicy,
  searchQueriesForIntent,
  validateAssetIntent,
  type AssetIntent
} from "./asset-intent.js";

/** A candidate as returned by search, before anything has been downloaded. */
export interface ScreeningCandidate {
  /** Provider-qualified id, e.g. `objaverse:ffca09fb...`. */
  readonly id: string;
  readonly title?: string | undefined;
  readonly provider?: string | undefined;
  readonly licenseSpdx?: string | undefined;
  readonly author?: string | undefined;
  readonly sourcePage?: string | undefined;
  readonly downloadUrl?: string | undefined;
  /** Provider-reported rank score; used only for tie-breaks, never as fitness. */
  readonly searchScore?: number | undefined;
  /** True when the candidate can be fetched without interactive auth. */
  readonly autoPullable?: boolean | undefined;
  readonly sizeBytes?: number | undefined;
}

/** Result of pulling a candidate to a local path. */
export interface ScreeningPullResult {
  readonly localPath: string;
  readonly sizeBytes?: number | undefined;
}

/** Per-instance render cost, which a triangle budget does not capture. */
export interface ScreeningRenderCost {
  readonly drawCallsPerInstance?: number | undefined;
}

/** Injected effects. Each may throw; a throw rejects that candidate and the pipeline continues. */
export interface ScreeningEffects {
  /** Enumerate candidates for a query. */
  search(query: string): Promise<readonly ScreeningCandidate[]>;
  /** Download a candidate. */
  pull(candidate: ScreeningCandidate): Promise<ScreeningPullResult>;
  /** Structural geometry facts from the pulled file. */
  inspectGeometry(candidate: ScreeningCandidate, pull: ScreeningPullResult): Promise<AssetGeometryFacts & ScreeningRenderCost>;
  /**
   * Render the candidate in isolation and report whether required features read.
   *
   * Optional: when absent, admission reports rendered visibility as `unproven` rather than passing,
   * which is the honest outcome. It must never be synthesised from geometry.
   */
  renderProbe?: ((candidate: ScreeningCandidate, pull: ScreeningPullResult) => Promise<AssetRenderedFacts>) | undefined;
  /** Register the accepted asset durably and generate typed bindings. */
  register?: ((candidate: ScreeningCandidate, pull: ScreeningPullResult) => Promise<{ readonly assetId: string; readonly typedRef: string }>) | undefined;
}

export type ScreeningStage =
  | "search"
  | "license-policy"
  | "auto-pullable"
  | "pull"
  | "inspect-geometry"
  | "budget"
  | "render-probe"
  | "admission"
  | "register";

/** One candidate's outcome, retained whether accepted or not. */
export interface ScreeningCandidateOutcome {
  readonly candidate: ScreeningCandidate;
  /** Zero-based position in the deduplicated enumerated list. */
  readonly index: number;
  readonly accepted: boolean;
  /** Stage at which the candidate was rejected. `undefined` when accepted. */
  readonly rejectedAtStage?: ScreeningStage | undefined;
  /** Machine-readable rejection reasons. Never empty for a rejected candidate. */
  readonly reasons: readonly string[];
  readonly geometry?: (AssetGeometryFacts & ScreeningRenderCost) | undefined;
  readonly rendered?: AssetRenderedFacts | undefined;
  readonly admission?: AssetAdmissionReport | undefined;
}

export interface ScreeningReport {
  readonly schema: "aura3d-asset-screening/1.0";
  readonly intentId: string;
  readonly role: string;
  readonly queries: readonly string[];
  /** Every candidate seen, in enumeration order, with its outcome. */
  readonly candidates: readonly ScreeningCandidateOutcome[];
  /** Accepted candidates, best first. */
  readonly ranked: readonly ScreeningCandidateOutcome[];
  /** The selected candidate, when one was accepted or a fallback allowed one. */
  readonly selected?: ScreeningCandidateOutcome | undefined;
  /** Set when the selection only satisfied a fallback policy; names what is still unproven. */
  readonly fallbackApplied?: { readonly policy: string; readonly gaps: readonly string[] } | undefined;
  readonly registered?: { readonly assetId: string; readonly typedRef: string } | undefined;
  /** Counts per stage, so "where do candidates die?" is answerable without reading every entry. */
  readonly rejectionsByStage: Readonly<Record<string, number>>;
}

export interface ScreeningOptions {
  readonly intent: AssetIntent;
  readonly effects: ScreeningEffects;
  /** Maximum candidates to pull. Pulling is the expensive stage, so it is bounded. */
  readonly maxCandidatesToPull?: number | undefined;
  /** Stop after the first accepted candidate. Default true; set false to rank the whole set. */
  readonly stopAtFirstAccepted?: boolean | undefined;
}

/**
 * Run the screening pipeline for an intent.
 *
 * Throws only for an incoherent intent -- a request that cannot be satisfied as written is a caller
 * defect, not a screening outcome. Everything else is reported.
 */
export async function screenAssetCandidates(options: ScreeningOptions): Promise<ScreeningReport> {
  const { intent, effects } = options;
  const intentProblems = validateAssetIntent(intent);
  if (intentProblems.length > 0) {
    throw new Error(`Asset intent "${intent.id}" cannot be satisfied as written: ${intentProblems.join("; ")}`);
  }

  const requirement = admissionRequirementForIntent(intent);
  const queries = searchQueriesForIntent(intent);
  const maxPulls = options.maxCandidatesToPull ?? 6;
  const stopEarly = options.stopAtFirstAccepted ?? true;

  // Enumerate across every query phrasing, deduplicated by id. Order is query specificity then provider
  // rank, so `index` is stable and reproducible for a given search response.
  const seen = new Set<string>();
  const enumerated: ScreeningCandidate[] = [];
  for (const query of queries) {
    let found: readonly ScreeningCandidate[] = [];
    try {
      found = await effects.search(query);
    } catch {
      // A failing query is not a failing screen; other phrasings may still return candidates.
      continue;
    }
    for (const candidate of found) {
      if (!candidate?.id || seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      enumerated.push(candidate);
    }
  }

  const outcomes: ScreeningCandidateOutcome[] = [];
  let pulls = 0;

  for (const [index, candidate] of enumerated.entries()) {
    // Cheap structural gates first: never spend a download on a candidate the intent already excludes.
    if (!licenseSatisfiesPolicy(candidate.licenseSpdx, intent.licensePolicy)) {
      outcomes.push({
        candidate, index, accepted: false, rejectedAtStage: "license-policy",
        reasons: [`license-policy:${candidate.licenseSpdx ?? "unknown"} does not satisfy ${intent.licensePolicy}`]
      });
      continue;
    }
    if (candidate.autoPullable === false) {
      outcomes.push({
        candidate, index, accepted: false, rejectedAtStage: "auto-pullable",
        reasons: ["auto-pullable:candidate requires interactive authentication and was skipped"]
      });
      continue;
    }
    const maxBytes = intent.geometryBudget?.maxFileBytes;
    if (maxBytes !== undefined && candidate.sizeBytes !== undefined && candidate.sizeBytes > maxBytes) {
      outcomes.push({
        candidate, index, accepted: false, rejectedAtStage: "budget",
        reasons: [`budget:file size ${candidate.sizeBytes} exceeds maxFileBytes ${maxBytes}`]
      });
      continue;
    }

    if (pulls >= maxPulls) {
      outcomes.push({
        candidate, index, accepted: false, rejectedAtStage: "pull",
        reasons: [`pull:not attempted, pull budget of ${maxPulls} candidate(s) was exhausted`]
      });
      continue;
    }

    let pull: ScreeningPullResult;
    try {
      pull = await effects.pull(candidate);
      pulls += 1;
    } catch (error) {
      outcomes.push({
        candidate, index, accepted: false, rejectedAtStage: "pull",
        reasons: [`pull:${errorText(error)}`]
      });
      continue;
    }

    let geometry: AssetGeometryFacts & ScreeningRenderCost;
    try {
      geometry = await effects.inspectGeometry(candidate, pull);
    } catch (error) {
      outcomes.push({
        candidate, index, accepted: false, rejectedAtStage: "inspect-geometry",
        reasons: [`inspect-geometry:${errorText(error)}`]
      });
      continue;
    }

    // Per-instance draw cost. A triangle budget does not capture it, and it caused a real regression:
    // a correctly-rendering 42-node/5-material tree drove a route to 840 draw calls and a blank capture.
    const maxDrawCalls = intent.geometryBudget?.maxDrawCallsPerInstance;
    if (maxDrawCalls !== undefined && geometry.drawCallsPerInstance !== undefined &&
        geometry.drawCallsPerInstance > maxDrawCalls) {
      outcomes.push({
        candidate, index, accepted: false, rejectedAtStage: "budget", geometry,
        reasons: [`budget:${geometry.drawCallsPerInstance} draw calls per instance exceeds maxDrawCallsPerInstance ${maxDrawCalls}`]
      });
      continue;
    }

    let rendered: AssetRenderedFacts | undefined;
    if (effects.renderProbe) {
      try {
        rendered = await effects.renderProbe(candidate, pull);
      } catch (error) {
        outcomes.push({
          candidate, index, accepted: false, rejectedAtStage: "render-probe", geometry,
          reasons: [`render-probe:${errorText(error)}`]
        });
        continue;
      }
    }

    const provenance: AssetProvenanceFacts = {
      ...(candidate.licenseSpdx ? { license: candidate.licenseSpdx } : {}),
      ...(candidate.author ? { author: candidate.author } : {}),
      ...(candidate.sourcePage ? { sourcePage: candidate.sourcePage } : {}),
      ...(candidate.provider ? { provider: candidate.provider } : {})
    };
    const admission = admitAssetForRole({
      assetId: candidate.id,
      requirement,
      geometry,
      ...(rendered ? { rendered } : {}),
      provenance
    });

    outcomes.push({
      candidate,
      index,
      accepted: admission.admitted,
      ...(admission.admitted ? {} : { rejectedAtStage: "admission" as const }),
      reasons: admission.admitted ? [] : [...admission.blockers, ...admission.unproven],
      geometry,
      ...(rendered ? { rendered } : {}),
      admission
    });

    if (admission.admitted && stopEarly) break;
  }

  const accepted = outcomes.filter((outcome) => outcome.accepted);
  const ranked = [...accepted].sort((a, b) => rankScore(b) - rankScore(a));
  let selected = ranked[0];
  let fallbackApplied: ScreeningReport["fallbackApplied"];

  if (!selected) {
    const policy = intent.fallbackPolicy ?? "reject-and-fail";
    if (policy === "accept-best-with-recorded-gaps") {
      // Only candidates whose *sole* failures are unproven checks may be promoted. A candidate with a
      // hard blocker is wrong, not merely unverified, and no fallback policy may accept it.
      const salvageable = outcomes
        .filter((outcome) => outcome.admission && outcome.admission.blockers.length === 0 && outcome.admission.unproven.length > 0)
        .sort((a, b) => rankScore(b) - rankScore(a));
      selected = salvageable[0];
      if (selected) {
        fallbackApplied = { policy, gaps: selected.admission?.unproven ?? [] };
      }
    } else if (policy === "downgrade-role") {
      const downgradable = outcomes
        .filter((outcome) => (outcome.admission?.suitableAlternativeRoles.length ?? 0) > 0)
        .sort((a, b) => rankScore(b) - rankScore(a));
      selected = downgradable[0];
      if (selected) {
        fallbackApplied = {
          policy,
          gaps: [`role downgraded to one of: ${selected.admission?.suitableAlternativeRoles.join(", ")}`]
        };
      }
    }
  }

  let registered: ScreeningReport["registered"];
  if (selected && effects.register) {
    const pullForSelected = await effects.pull(selected.candidate).catch(() => undefined);
    if (pullForSelected) {
      registered = await effects.register(selected.candidate, pullForSelected).catch(() => undefined);
    }
  }

  const rejectionsByStage: Record<string, number> = {};
  for (const outcome of outcomes) {
    if (!outcome.rejectedAtStage) continue;
    rejectionsByStage[outcome.rejectedAtStage] = (rejectionsByStage[outcome.rejectedAtStage] ?? 0) + 1;
  }

  return {
    schema: "aura3d-asset-screening/1.0",
    intentId: intent.id,
    role: intent.role,
    queries,
    candidates: outcomes,
    ranked,
    ...(selected ? { selected } : {}),
    ...(fallbackApplied ? { fallbackApplied } : {}),
    ...(registered ? { registered } : {}),
    rejectionsByStage
  };
}

/**
 * Fitness ordering for accepted candidates.
 *
 * Deliberately does **not** lead with the provider's search score: provider rank is relevance to a text
 * query, not fitness for a role, and trusting it is what made "resolve always takes the top hit" a
 * defect. Rendered-visibility evidence and admission cleanliness dominate; search score is a tie-break.
 */
function rankScore(outcome: ScreeningCandidateOutcome): number {
  let score = 0;
  if (outcome.accepted) score += 1_000;
  score -= (outcome.admission?.blockers.length ?? 0) * 100;
  score -= (outcome.admission?.unproven.length ?? 0) * 10;
  // Rendered proof across more angles is stronger evidence.
  score += (outcome.rendered?.renderedAzimuths?.length ?? 0) * 5;
  score += Math.min(outcome.candidate.searchScore ?? 0, 9) / 10;
  return score;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Render a screening report as human-readable lines. Every rejection keeps its reason. */
export function formatScreeningReport(report: ScreeningReport): readonly string[] {
  const lines = [
    `intent ${report.intentId} (role ${report.role})`,
    `queries: ${report.queries.join(" | ")}`,
    `candidates enumerated: ${report.candidates.length}`
  ];
  for (const outcome of report.candidates) {
    lines.push(`  [${outcome.index}] ${outcome.accepted ? "ACCEPTED" : `rejected@${outcome.rejectedAtStage}`} ${outcome.candidate.id}`);
    for (const reason of outcome.reasons) lines.push(`        - ${reason}`);
  }
  if (report.selected) {
    lines.push(`selected: ${report.selected.candidate.id}`);
    if (report.fallbackApplied) {
      lines.push(`  via fallback ${report.fallbackApplied.policy}; unresolved gaps:`);
      for (const gap of report.fallbackApplied.gaps) lines.push(`    ? ${gap}`);
    }
  } else {
    lines.push("selected: none -- no candidate satisfied the intent");
  }
  if (report.registered) lines.push(`registered: ${report.registered.assetId} -> ${report.registered.typedRef}`);
  return lines;
}
