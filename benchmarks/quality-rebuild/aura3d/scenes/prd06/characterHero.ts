// Reference module for the `character-hero` template (PRD-06 T4.3; carried
// into PRD-13 by Q-13-3). This is the `characterAnimation(controller, hero,
// spec)` wiring that replaces the character-controller template's
// `.animate({ clip: "Take 001" })` and its HUD-only `createLocomotionKit`
// weights: the HUD reads `binding.snapshot().weights` instead.
//
// Clip names are verified against the admitted lane hero GLB
// (`auraClashPlayerRig`, 65 joints / 12 clips) by
// tests/qr/prd06/unit/character-controller-binding.test.ts. Q-13-3 swaps the
// template's `showcaseWalkAnimatedGirl` for a C-17-admitted rig (Q-05-2) that
// passes the `template-hero` validator profile (T4.6).
import type { AuraApp, AuraRuntimeNodeHandle } from "@aura3d/engine";
import {
  characterAnimation,
  type AuraCharacterAnimationBinding,
  type AuraCharacterAnimationSpec,
  type AuraCharacterControllerLike
} from "@aura3d/engine/lanes";

/** T4.6 validator profile the character-hero template's GLB must pass. */
export const characterHeroValidatorProfile = "template-hero" as const;

/**
 * Canonical §6.9 action → embedded clip name on the lane hero
 * (`auraClashPlayerRig.3318d671.glb`). `turn-l`/`turn-r`/`interact` have no
 * source clip on this rig — they are omitted here and land with the
 * C-17-admitted template hero under Q-05-2.
 */
export const characterHeroClips = {
  idle: "Idle_Loop",
  walk: "Walk_Loop",
  run: "Sprint_Loop",
  sprint: "Sprint_Loop",
  "jump-start": "Jump_Loop",
  "jump-loop": "Jump_Loop",
  land: "Crouch_Idle_Loop",
  attack: "Sword_Attack",
  "hit-react": "Hit_Head",
  block: "Sword_Block",
  death: "Death01"
} as const;

export type CharacterHeroAction = keyof typeof characterHeroClips;
export type CharacterHeroClipMap = typeof characterHeroClips;

/**
 * §7.1 spec matching the character-controller template's tuning
 * (walk 1.6 m/s, run 4.4 m/s). `footIk`/`lookAt` stay caller-specified —
 * the T4.4 lane scene wires the rig's real leg chains and head bone.
 */
export function characterHeroAnimationSpec(
  clips: Readonly<CharacterHeroClipMap> | Readonly<Record<string, string>> = characterHeroClips
): AuraCharacterAnimationSpec {
  return {
    locomotion: {
      param: "speed",
      syncGroup: "locomotion",
      smoothing: 0.2,
      clips: [
        { clip: clips.idle!, at: 0 },
        { clip: clips.walk!, at: 1.6 },
        { clip: clips.run!, at: 4.4 }
      ]
    },
    airborne: {
      jumpStart: clips["jump-start"],
      fall: clips["jump-loop"],
      land: clips.land,
      landBlend: 0.15
    },
    actions: {
      attack: { clip: clips.attack!, layer: "action", mask: { humanoid: "upper-body" }, blendIn: 0.1, blendOut: 0.2 },
      "hit-react": { clip: clips["hit-react"]!, layer: "action", mask: { humanoid: "upper-body" }, blendIn: 0.05, blendOut: 0.2 },
      block: { clip: clips.block!, layer: "action", mask: { humanoid: "upper-body" }, blendIn: 0.15 },
      death: { clip: clips.death!, layer: "action", blendIn: 0.1 }
    }
  };
}

/**
 * Bind `controller` (the template's `{ speed }` state counts — the binding
 * reads it structurally) to `hero` — returns the T4.2 binding whose
 * `snapshot()` doubles as the HUD's clip-weight source.
 */
export function bindCharacterHero(
  controller: AuraCharacterControllerLike,
  hero: AuraRuntimeNodeHandle,
  spec: AuraCharacterAnimationSpec = characterHeroAnimationSpec(),
  options?: { readonly app?: AuraApp }
): AuraCharacterAnimationBinding {
  return characterAnimation(controller, hero, spec, options);
}
