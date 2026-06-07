import {
  fighterAssetReference,
  type AuraClashFighterDefinition
} from "../FighterDefinition";

export const nyxVale = {
  id: "nyx",
  name: "Nyx Vale",
  metadata: {
    slot: 3,
    callsign: "Mirror feint",
    title: "Agile trickster",
    slug: "nyx-vale",
    rosterGroup: "Aura Clash Originals",
    role: "original playable fighter",
    archetype: "Side switches, evasive taps, whiff traps",
    designPillar:
      "Technical movement fighter with readable feints, high meter start, and lower direct damage."
  },
  asset: fighterAssetReference("nyx", "fighter-nyx-vale"),
  stats: {
    maxHealth: 100,
    maxGuard: 100,
    startingMeter: 42,
    meterCap: 100,
    attack: 70,
    defense: 62,
    speed: 94,
    technique: 96,
    range: 70,
    guardPressure: 68,
    meterBuild: 90,
    weight: 46
  },
  comboTuning: {
    maxPracticalHits: 9,
    hitConfirmWindowMs: 250,
    cancelWindowMs: 180,
    resetWindowMs: 700,
    baseDamageScaling: [1, 0.88, 0.76, 0.64, 0.52],
    hitstunDecayPerHit: 0.08,
    guardPressureDecayPerHit: 0.07,
    meterGainMultiplier: 1.16,
    routes: [
      {
        id: "nyx.mirror-tap",
        label: "Mirror Tap",
        starter: "light",
        sequence: ["light", "dash", "light", "special"],
        targetDamage: 28,
        meterSwing: 15,
        difficulty: "standard",
        notes: "Shows Nyx's side-switch identity while staying in the current action set."
      },
      {
        id: "nyx.whiff-lure",
        label: "Whiff Lure",
        starter: "dash",
        sequence: ["dash", "guard", "heavy", "special"],
        targetDamage: 33,
        meterSwing: 10,
        difficulty: "advanced",
        notes: "Dash and guard simulate a whiff trap before the heavy confirm."
      },
      {
        id: "nyx.glass-route",
        label: "Glass Route",
        starter: "heavy",
        sequence: ["heavy", "light", "dash", "special"],
        targetDamage: 35,
        meterSwing: 7,
        difficulty: "expert",
        notes: "High-skill route with tight cancel expectations and lower scaling."
      }
    ]
  },
  visualProfile: {
    palette: {
      displayName: "Violet / cyan",
      primary: "#26123F",
      secondary: "#A5F3FC",
      accent: "#8B5CF6",
      aura: "#22D3EE",
      hud: "#C4B5FD"
    },
    silhouette: [
      "Asymmetric cloak edge",
      "High evasive stance",
      "Offset mirror afterimage",
      "Thin cyan ankle trails"
    ],
    materials: [
      "deep violet cloth",
      "cyan mirror glass shards",
      "soft black shadow mesh",
      "glossy feint panels"
    ],
    motifs: [
      "mirror shards",
      "split silhouettes",
      "violet smoke",
      "cyan reflection cuts"
    ],
    idlePose:
      "Leans away from center as a faint mirror double appears one step behind.",
    introPose:
      "Walks through a vertical mirror panel that shatters into harmless cyan shards.",
    victoryPose:
      "Bows while two afterimages clap out of sync and dissolve into violet smoke.",
    portrait: {
      camera: "Offset trickster closeup with a reflection double",
      background: "Violet alley glass with cyan rim lights",
      expression: "Half-smile, unreadable"
    },
    vfx: {
      aura: "Soft violet smoke with cyan mirror edges",
      trail: "Split afterimage ribbon",
      impact: "Glass-light shard pop and reflection ripple",
      guard: "Brief mirror panel that turns opaque on block",
      signature: "Mirror Feint side-switch clone that collapses into cyan impact"
    }
  },
  moveKit: {
    archetype: "Side switches, evasive taps, whiff traps",
    combatStyleTags: ["trickster", "mobility", "feint", "whiff-punish"],
    baseAttacks: {
      light: {
        id: "nyx.glass-tap",
        name: "Glass Tap",
        input: "light",
        kind: "strike",
        range: "close",
        description: "A quick tap that leaves a tiny mirror crack in the air.",
        gameplayNote: "Low damage but excellent for keeping combo routes alive.",
        accessibilityCue: "Mirror crack has a crisp sound/text pairing for hit confirmation.",
        vfxMotifs: ["mirror crack", "violet spark"],
        frame: { startupMs: 75, activeMs: 75, recoveryMs: 130, cooldownMs: 30 },
        hit: {
          damage: 6,
          guardDamage: 8,
          meterGain: 8,
          meterCost: 0,
          stunMs: 170,
          pushback: 2.8,
          launch: 0.1,
          hitAdvantageMs: 100,
          blockAdvantageMs: -20,
          cancellableInto: ["light", "heavy", "dash", "special"],
          comboTags: ["starter", "feint", "light"]
        }
      },
      heavy: {
        id: "nyx.rift-heel",
        name: "Rift Heel",
        input: "heavy",
        kind: "antiAir",
        range: "mid",
        description: "A rising heel kick through a cyan reflection seam.",
        gameplayNote: "Anti-air and whiff punish that needs spacing.",
        accessibilityCue: "The reflection seam marks where the hitbox is active.",
        vfxMotifs: ["cyan seam", "violet crescent"],
        frame: { startupMs: 150, activeMs: 110, recoveryMs: 250, cooldownMs: 60 },
        hit: {
          damage: 12,
          guardDamage: 14,
          meterGain: 8,
          meterCost: 0,
          stunMs: 320,
          pushback: 4.8,
          launch: 2.2,
          hitAdvantageMs: 130,
          blockAdvantageMs: -100,
          cancellableInto: ["dash", "special"],
          comboTags: ["heavy", "anti-air", "side-switch"]
        }
      },
      guard: {
        id: "nyx.mirror-screen",
        name: "Mirror Screen",
        input: "guard",
        kind: "guard",
        range: "close",
        description: "A thin reflective screen catches one hit and offsets Nyx's stance.",
        gameplayNote: "Short guard window; best when paired with dash movement.",
        accessibilityCue: "Guard state is represented by a visible panel and HUD chip.",
        vfxMotifs: ["mirror panel", "cyan ripple"],
        frame: { startupMs: 45, activeMs: 200, recoveryMs: 130, cooldownMs: 90 },
        hit: {
          damage: 0,
          guardDamage: 0,
          meterGain: 7,
          meterCost: 0,
          stunMs: 0,
          pushback: 1.4,
          launch: 0,
          hitAdvantageMs: 60,
          blockAdvantageMs: 90,
          cancellableInto: ["dash", "light"],
          comboTags: ["guard", "feint"]
        }
      },
      dash: {
        id: "nyx.phase-step",
        name: "Phase Step",
        input: "dash",
        kind: "movement",
        range: "mid",
        description: "A fast evasive step that leaves a misplaced reflection behind.",
        gameplayNote: "Nyx's best neutral tool and a route starter.",
        accessibilityCue: "Reduced-motion mode can show the reflection without the slide smear.",
        vfxMotifs: ["afterimage", "mirror dust"],
        frame: { startupMs: 45, activeMs: 130, recoveryMs: 120, cooldownMs: 110 },
        hit: {
          damage: 0,
          guardDamage: 0,
          meterGain: 5,
          meterCost: 0,
          stunMs: 0,
          pushback: 0,
          launch: 0,
          hitAdvantageMs: 0,
          blockAdvantageMs: 0,
          cancellableInto: ["light", "heavy", "special"],
          comboTags: ["movement", "side-switch", "feint"]
        }
      }
    },
    signature: {
      id: "nyx.mirror-feint",
      name: "Mirror Feint",
      input: "special",
      kind: "trap",
      range: "mid",
      description: "A clone appears on one side while Nyx strikes from the other.",
      gameplayNote: "Current-app Aura Burst with strong meter conversion and moderate damage.",
      accessibilityCue: "Combat log identifies the real hit so the move is readable without color.",
      vfxMotifs: ["clone split", "cyan shard burst", "violet smoke"],
      frame: { startupMs: 170, activeMs: 120, recoveryMs: 280, cooldownMs: 180 },
      hit: {
        damage: 21,
        guardDamage: 25,
        meterGain: 0,
        meterCost: 35,
        stunMs: 450,
        pushback: 6.4,
        launch: 1.8,
        hitAdvantageMs: 180,
        blockAdvantageMs: -80,
        cancellableInto: [],
        comboTags: ["special", "trap", "finisher"]
      }
    }
  },
  routeTags: ["playable", "evidence", "accessibility", "poster", "home"],
  contentNotes: [
    {
      rule: "original-ip",
      note: "Nyx Vale is an original trickster built for fictional arcade combat."
    },
    {
      rule: "typed-asset",
      note: "Use fighter.asset.typedAssetMember, which resolves to a final Aura Clash release rig in the generated typed asset manifest."
    },
    {
      rule: "readable-hud",
      note: "Feints must be supported by state chips and combat-log text."
    }
  ]
} as const satisfies AuraClashFighterDefinition;
