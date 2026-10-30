/**
 * `aura3d assets certify-game-geometry --category <c>` rules. racing and platformer are the original two; GU47 WP-9 (E-I)
 * adds sports, fighting, arena and puzzle. A category certifies at most two kinds of asset:
 *   - a subject (vehicle or character) from its hash-bound retained browser probe, as before for racing vehicles and
 *     platformer characters (sports athletes, fighters, arena characters);
 *   - a playable surface from the create-aura3d geometry probe: the racing track topology, or the platformer
 *     playable-surface map, which also describes a court or field, a fight stage, an arena floor and a puzzle board.
 * racing and platformer keep their exact certification ids and probes.
 */
import type { AuraCliCertifyCategory, AuraCliGameAssetCertification } from "../../asset-core-types.js";

export interface CertifyCategoryRule {
  readonly subject?: { readonly role: "vehicle" | "character"; readonly certification: AuraCliGameAssetCertification; readonly label: string };
  readonly surface: { readonly probe: "racing" | "platformer"; readonly certification: AuraCliGameAssetCertification };
}

export const CERTIFY_CATEGORIES = ["racing", "platformer", "sports", "fighting", "arena", "puzzle"] as const satisfies readonly AuraCliCertifyCategory[];

export const CERTIFY_CATEGORY_RULES: Readonly<Record<AuraCliCertifyCategory, CertifyCategoryRule>> = {
  racing: {
    subject: { role: "vehicle", certification: "certified-racing-vehicle", label: "racing-vehicle" },
    surface: { probe: "racing", certification: "certified-racing-track" }
  },
  platformer: {
    subject: { role: "character", certification: "certified-platformer-character", label: "platformer-character" },
    surface: { probe: "platformer", certification: "certified-platformer-world" }
  },
  sports: {
    subject: { role: "character", certification: "certified-sports-athlete", label: "sports-athlete" },
    surface: { probe: "platformer", certification: "certified-sports-venue" }
  },
  fighting: {
    subject: { role: "character", certification: "certified-fighting-character", label: "fighting-character" },
    surface: { probe: "platformer", certification: "certified-fighting-stage" }
  },
  arena: {
    subject: { role: "character", certification: "certified-arena-character", label: "arena-character" },
    surface: { probe: "platformer", certification: "certified-arena-world" }
  },
  puzzle: {
    surface: { probe: "platformer", certification: "certified-puzzle-board" }
  }
};

export function isCertifyCategory(value: unknown): value is AuraCliCertifyCategory {
  return typeof value === "string" && (CERTIFY_CATEGORIES as readonly string[]).includes(value);
}

export const CERTIFY_CATEGORY_USAGE = CERTIFY_CATEGORIES.join("|");
