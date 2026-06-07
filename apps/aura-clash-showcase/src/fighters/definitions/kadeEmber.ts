import {
  fighterAssetReference,
  type AuraClashFighterDefinition
} from "../FighterDefinition";

export const kadeEmber = {
  id: "kade",
  name: "Kade Ember",
  metadata: {
    slot: 4,
    callsign: "Heatline shoto",
    title: "Balanced striker",
    slug: "kade-ember",
    rosterGroup: "Aura Clash Originals",
    role: "original playable fighter",
    archetype: "Clean confirms, anti-air, fire sweep pressure",
    designPillar:
      "Balanced reference fighter that proves the launch roster has a readable baseline kit."
  },
  asset: fighterAssetReference("kade", "fighter-kade-ember"),
  stats: {
    maxHealth: 100,
    maxGuard: 100,
    startingMeter: 38,
    meterCap: 100,
    attack: 80,
    defense: 76,
    speed: 78,
    technique: 82,
    range: 76,
    guardPressure: 78,
    meterBuild: 82,
    weight: 68
  },
  comboTuning: {
    maxPracticalHits: 7,
    hitConfirmWindowMs: 240,
    cancelWindowMs: 155,
    resetWindowMs: 820,
    baseDamageScaling: [1, 0.91, 0.8, 0.68, 0.56],
    hitstunDecayPerHit: 0.06,
    guardPressureDecayPerHit: 0.05,
    meterGainMultiplier: 1.04,
    routes: [
      {
        id: "kade.clean-confirm",
        label: "Clean Confirm",
        starter: "light",
        sequence: ["light", "heavy", "special"],
        targetDamage: 34,
        meterSwing: 10,
        difficulty: "starter",
        notes: "Baseline route for app smoke behavior: one light, one heavy, one named special."
      },
      {
        id: "kade.heatline-carry",
        label: "Heatline Carry",
        starter: "dash",
        sequence: ["dash", "light", "heavy", "special"],
        targetDamage: 37,
        meterSwing: 8,
        difficulty: "standard",
        notes: "Dash adds spacing before a consistent midrange Ember Arc finish."
      },
      {
        id: "kade.anti-air-route",
        label: "Anti-air Route",
        starter: "heavy",
        sequence: ["heavy", "light", "special"],
        targetDamage: 36,
        meterSwing: 7,
        difficulty: "advanced",
        notes: "Uses Solar Upper as a launcher-style punish route."
      }
    ]
  },
  visualProfile: {
    palette: {
      displayName: "Red / gold",
      primary: "#3A1110",
      secondary: "#FDE68A",
      accent: "#EF4444",
      aura: "#F59E0B",
      hud: "#FFD166"
    },
    silhouette: [
      "Classic squared stance",
      "One glowing lead fist",
      "Heatline trim on jacket and shoes",
      "Balanced shoulder width"
    ],
    materials: [
      "deep red fabric",
      "brushed gold trim",
      "warm ember glass",
      "charcoal undersuit"
    ],
    motifs: [
      "ember arcs",
      "heatline grids",
      "gold sweep crescents",
      "short flame pixels"
    ],
    idlePose:
      "Settles into a clean stance while ember pixels rise from the lead glove.",
    introPose:
      "Draws a golden arc across the floor and steps through the heatline.",
    victoryPose:
      "Raises a fist as red sparks collapse into a controlled gold ring.",
    portrait: {
      camera: "Straight-on balanced fighter hero shot",
      background: "Red skyline haze with gold heatline rails",
      expression: "Steady and confident"
    },
    vfx: {
      aura: "Warm gold fire rim that stays below flash thresholds",
      trail: "Short red-to-gold sweep lines",
      impact: "Ember pixel bursts and heat shimmer",
      guard: "Gold circular parry flare",
      signature: "Ember Arc crescent crossing the mid lane"
    }
  },
  moveKit: {
    archetype: "Clean confirms, anti-air, fire sweep pressure",
    combatStyleTags: ["balanced", "anti-air", "midrange", "confirm"],
    baseAttacks: {
      light: {
        id: "kade.ember-jab",
        name: "Ember Jab",
        input: "light",
        kind: "strike",
        range: "close",
        description: "A compact jab that throws a small warm spark from the knuckles.",
        gameplayNote: "Reliable starter with average range and strong clarity.",
        accessibilityCue: "Short hit text and a warm spark mark a successful confirm.",
        vfxMotifs: ["ember spark", "gold knuckle line"],
        frame: { startupMs: 80, activeMs: 80, recoveryMs: 150, cooldownMs: 40 },
        hit: {
          damage: 8,
          guardDamage: 10,
          meterGain: 7,
          meterCost: 0,
          stunMs: 190,
          pushback: 3.4,
          launch: 0.1,
          hitAdvantageMs: 90,
          blockAdvantageMs: -35,
          cancellableInto: ["heavy", "special", "dash"],
          comboTags: ["starter", "balanced", "light"]
        }
      },
      heavy: {
        id: "kade.solar-upper",
        name: "Solar Upper",
        input: "heavy",
        kind: "antiAir",
        range: "mid",
        description: "A rising gold uppercut that checks jumps and overextensions.",
        gameplayNote: "Balanced anti-air with clear risk on block.",
        accessibilityCue: "Vertical heatline indicates the active anti-air path.",
        vfxMotifs: ["vertical flame", "gold upper arc"],
        frame: { startupMs: 150, activeMs: 120, recoveryMs: 270, cooldownMs: 70 },
        hit: {
          damage: 14,
          guardDamage: 18,
          meterGain: 8,
          meterCost: 0,
          stunMs: 350,
          pushback: 5.7,
          launch: 2.7,
          hitAdvantageMs: 120,
          blockAdvantageMs: -115,
          cancellableInto: ["special"],
          comboTags: ["heavy", "anti-air", "launcher"]
        }
      },
      guard: {
        id: "kade.gold-guard",
        name: "Gold Guard",
        input: "guard",
        kind: "guard",
        range: "close",
        description: "A round gold flare catches pressure and fades into ember dust.",
        gameplayNote: "Middle-of-roster guard durability and meter reward.",
        accessibilityCue: "Guard state is visible as both a ring and HUD text.",
        vfxMotifs: ["gold ring", "ember dust"],
        frame: { startupMs: 50, activeMs: 260, recoveryMs: 130, cooldownMs: 90 },
        hit: {
          damage: 0,
          guardDamage: 0,
          meterGain: 6,
          meterCost: 0,
          stunMs: 0,
          pushback: 1.8,
          launch: 0,
          hitAdvantageMs: 50,
          blockAdvantageMs: 100,
          cancellableInto: ["light", "heavy"],
          comboTags: ["guard", "balanced"]
        }
      },
      dash: {
        id: "kade.burn-step",
        name: "Burn Step",
        input: "dash",
        kind: "movement",
        range: "mid",
        description: "A clean forward step along a short red heatline.",
        gameplayNote: "Average dash that keeps spacing predictable.",
        accessibilityCue: "Reduced-motion mode can keep the floor line while removing smear.",
        vfxMotifs: ["red floor line", "gold heel spark"],
        frame: { startupMs: 55, activeMs: 120, recoveryMs: 140, cooldownMs: 120 },
        hit: {
          damage: 0,
          guardDamage: 0,
          meterGain: 4,
          meterCost: 0,
          stunMs: 0,
          pushback: 0,
          launch: 0,
          hitAdvantageMs: 0,
          blockAdvantageMs: 0,
          cancellableInto: ["light", "heavy"],
          comboTags: ["movement", "spacing"]
        }
      }
    },
    signature: {
      id: "kade.ember-arc",
      name: "Ember Arc",
      input: "special",
      kind: "projectile",
      range: "long",
      description: "A controlled red-gold crescent travels forward at chest height.",
      gameplayNote: "Most honest Aura Burst: strong confirm, moderate guard damage, clear travel path.",
      accessibilityCue: "Projectile path is wide and named in the combat log.",
      vfxMotifs: ["red-gold crescent", "heat shimmer", "ember pixels"],
      frame: { startupMs: 190, activeMs: 160, recoveryMs: 300, cooldownMs: 180 },
      hit: {
        damage: 24,
        guardDamage: 30,
        meterGain: 0,
        meterCost: 35,
        stunMs: 470,
        pushback: 7.8,
        launch: 1.5,
        hitAdvantageMs: 180,
        blockAdvantageMs: -95,
        cancellableInto: [],
        comboTags: ["special", "projectile", "finisher"]
      }
    }
  },
  routeTags: ["playable", "evidence", "accessibility", "poster", "home"],
  contentNotes: [
    {
      rule: "original-ip",
      note: "Kade Ember is the original balanced baseline for Aura Clash."
    },
    {
      rule: "typed-asset",
      note: "Use fighter.asset.typedAssetMember, which resolves to a final Aura Clash release rig in the generated typed asset manifest."
    },
    {
      rule: "readable-hud",
      note: "Kade's routes should remain the reference for clear health, guard, meter, and combo changes."
    }
  ]
} as const satisfies AuraClashFighterDefinition;
