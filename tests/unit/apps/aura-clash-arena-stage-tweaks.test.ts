import { describe, expect, it } from "vitest";
import {
  annotateAuraClashArenaStage,
  auraClashArenaStageElements,
  collectAuraClashArenaStageEvidence
} from "../../../apps/aura-clash-showcase/src/playable/arena/AuraClashArenaStage";
import {
  collectArenaTweaksState,
  createArenaTweaksEvidence
} from "../../../apps/aura-clash-showcase/src/playable/arena/ArenaTweaksPanel";
import { assertAuraClashFighterControllerBoundary } from "../../../apps/aura-clash-showcase/src/playable/combat/AuraClashFighterController";

interface FakeElement {
  dataset: Record<string, string>;
  classList: {
    add(value: string): void;
    contains(value: string): boolean;
  };
  style: {
    getPropertyValue(value: string): string;
  };
  value?: string;
}

interface FakeRoot extends ParentNode {
  element(selector: string): FakeElement;
}

function createStageRoot(): FakeRoot {
  const selectors = [
    ".aca",
    ".aca-sky",
    ".aca-portal",
    ".aca-skyline",
    ".aca-banners",
    ".aca-rays",
    ".aca-fog-far",
    ".aca-fog-drift",
    ".aca-fog-near",
    ".aca-dais",
    ".aca-platform",
    ".aca-floor-sheen",
    "#arena-particles",
    "#aura-clash-arena-canvas",
    ".aca-scanline",
    ".aca-stage-vignette",
    "#arena-fog"
  ];
  const elements = new Map<string, FakeElement>();
  for (const selector of selectors) {
    const classes = new Set<string>();
    elements.set(selector, {
      dataset: selector === ".aca" ? { palette: "cyber", backdrop: "portal", motion: "static" } : {},
      classList: {
        add(value: string) {
          classes.add(value);
        },
        contains(value: string) {
          return classes.has(value);
        }
      },
      style: {
        getPropertyValue() {
          return "";
        }
      },
      value: selector === "#arena-fog" ? "0.74" : undefined
    });
  }
  return {
    querySelector(selector: string) {
      return elements.get(selector) ?? null;
    },
    element(selector: string) {
      const element = elements.get(selector);
      if (!element) throw new Error(`Missing fake element ${selector}`);
      return element;
    }
  } as FakeRoot;
}

describe("Aura Clash arena stage evidence", () => {
  it("names each visual target element and annotates DOM evidence keys", () => {
    const root = createStageRoot();

    annotateAuraClashArenaStage(root);
    const evidence = collectAuraClashArenaStageEvidence(root);

    expect(evidence.evidenceBacked).toBe(true);
    expect(evidence.missingElementIds).toEqual([]);
    expect(evidence.namedElementCount).toBe(auraClashArenaStageElements.length);
    expect(evidence.togglableElementCount).toBeGreaterThan(0);
    expect(evidence.toggleGroups).toEqual(["accessibility", "backdrop", "motion", "particles", "reflections"]);
    expect(root.element(".aca-portal").dataset.stageEvidence).toBe("stage.portalCore");
  });
});

describe("Aura Clash arena tweaks evidence", () => {
  it("records visual-only tweak state without changing deterministic replay inputs", () => {
    const root = createStageRoot();
    const shell = root.element(".aca");
    shell.classList.add("aca-no-particles");

    const state = collectArenaTweaksState(root);
    const evidence = createArenaTweaksEvidence(root);

    expect(state).toMatchObject({
      palette: "cyber",
      backdrop: "portal",
      fogDensity: 0.74,
      motion: "static",
      particles: false,
      reflections: true
    });
    expect(evidence.includedInEvidence).toBe(true);
    expect(evidence.affectsDeterministicReplay).toBe(false);
    expect(evidence.deterministicReplayInputs).toEqual(["game.inputReplay", "game.runSimulation", "moveData", "roundRules"]);
  });
});

describe("Aura Clash fighter controller boundary", () => {
  it("declares engine combat-world as the only hit and damage source", () => {
    const boundary = assertAuraClashFighterControllerBoundary();

    expect(boundary.combatSource).toBe("engine.combatWorld");
    expect(boundary.routeMayQueueMoves).toBe(true);
    expect(boundary.routeMayMirrorEngineState).toBe(true);
    expect(boundary.routeMayCalculateHits).toBe(false);
    expect(boundary.routeMayCalculateDamage).toBe(false);
  });
});
