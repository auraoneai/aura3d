import {
  fighterAssetReference,
  type AuraClashFighterDefinition
} from "../FighterDefinition";

export const maraVolt = {
  id: "mara",
  name: "Mara Volt",
  metadata: {
    slot: 1,
    callsign: "Voltage rushdown",
    title: "Rushdown striker",
    slug: "mara-volt",
    rosterGroup: "Aura Clash Originals",
    role: "V1 playable fighter",
    archetype: "Fast entry, chain pressure, air-to-ground punishes",
    designPillar:
      "Immediate pressure fighter for players who want fast confirms, short cancels, and visible electric hit sparks."
  },
  asset: fighterAssetReference("mara", "fighter-mara-volt"),
  stats: {
    maxHealth: 100,
    maxGuard: 100,
    startingMeter: 34,
    meterCap: 100,
    attack: 82,
    defense: 66,
    speed: 96,
    technique: 78,
    range: 58,
    guardPressure: 74,
    meterBuild: 88,
    weight: 54
  },
  comboTuning: {
    maxPracticalHits: 8,
    hitConfirmWindowMs: 220,
    cancelWindowMs: 150,
    resetWindowMs: 780,
    baseDamageScaling: [1, 0.9, 0.78, 0.66, 0.54],
    hitstunDecayPerHit: 0.07,
    guardPressureDecayPerHit: 0.06,
    meterGainMultiplier: 1.12,
    routes: [
      {
        id: "mara.spark-entry",
        label: "Spark Entry",
        starter: "light",
        sequence: ["light", "light", "heavy", "special"],
        targetDamage: 31,
        meterSwing: 13,
        difficulty: "starter",
        notes: "Primary current-app route: quick light combo into a visible Aura Burst finish."
      },
      {
        id: "mara.corner-voltage",
        label: "Corner Voltage",
        starter: "dash",
        sequence: ["dash", "light", "heavy", "special"],
        targetDamage: 36,
        meterSwing: 9,
        difficulty: "standard",
        notes: "Dash shifts the lane before the heavy hit pushes the rival back into hitstun."
      },
      {
        id: "mara.guard-crackle",
        label: "Guard Crackle",
        starter: "guard",
        sequence: ["guard", "light", "light", "special"],
        targetDamage: 24,
        meterSwing: 16,
        difficulty: "advanced",
        notes: "Guard starts a punish only when the player blocks rival pressure cleanly."
      }
    ]
  },
  visualProfile: {
    palette: {
      displayName: "Emerald / cyan",
      primary: "#0B3D34",
      secondary: "#D6FFF6",
      accent: "#22C55E",
      aura: "#22D3EE",
      hud: "#7CFFCB"
    },
    silhouette: [
      "Compact sprinter stance",
      "Forward leaning shoulders",
      "Cyan heel and glove trails",
      "Short electric afterimages"
    ],
    materials: [
      "matte emerald suit panels",
      "cyan glassy circuit trim",
      "white sneaker highlights",
      "soft electric rim light"
    ],
    motifs: [
      "voltage chevrons",
      "circuit arcs",
      "speed-line ribbons",
      "short cyan sparks"
    ],
    idlePose:
      "Bounces on the lead foot while small cyan arcs climb from glove to shoulder.",
    introPose:
      "Skids into frame, taps the floor, and lights a short emerald current under both feet.",
    victoryPose:
      "Snaps a palm upward as cyan lightning corkscrews into the city lights.",
    portrait: {
      camera: "Low three-quarter action closeup",
      background: "Emerald rooftop grid with cyan street bloom",
      expression: "Focused and impatient"
    },
    vfx: {
      aura: "Thin cyan electricity around wrists and ankles",
      trail: "Emerald dash ribbons with cyan edges",
      impact: "Short spark bursts and circuit-line cracks",
      guard: "Tight electric shell that flickers once on block",
      signature: "Volt Step side-switch afterimage with a bright cyan hit spark"
    }
  },
  moveKit: {
    archetype: "Fast entry, chain pressure, air-to-ground punishes",
    combatStyleTags: ["rushdown", "chain-pressure", "mobility", "meter-build"],
    baseAttacks: {
      light: {
        id: "mara.spark-jab",
        name: "Spark Jab",
        input: "light",
        kind: "strike",
        range: "close",
        description: "A fast lead-hand tap that pops a cyan spark on contact.",
        gameplayNote: "Safe opener and the easiest way to grow the visible combo counter.",
        accessibilityCue: "Short text-backed hit message and small non-flash spark.",
        vfxMotifs: ["cyan spark", "small circuit crack"],
        frame: { startupMs: 70, activeMs: 80, recoveryMs: 140, cooldownMs: 30 },
        hit: {
          damage: 7,
          guardDamage: 9,
          meterGain: 7,
          meterCost: 0,
          stunMs: 180,
          pushback: 3.2,
          launch: 0.2,
          hitAdvantageMs: 90,
          blockAdvantageMs: -30,
          cancellableInto: ["light", "heavy", "special", "dash"],
          comboTags: ["starter", "light", "rushdown"]
        }
      },
      heavy: {
        id: "mara.circuit-breaker",
        name: "Circuit Breaker",
        input: "heavy",
        kind: "launcher",
        range: "mid",
        description: "A shoulder-led electric uppercut that lifts the rival into a short juggle.",
        gameplayNote: "Best after a confirmed light or dash because whiff recovery is longer.",
        accessibilityCue: "Larger knockback text and a clear upward animation state.",
        vfxMotifs: ["vertical arc", "emerald launch ring"],
        frame: { startupMs: 140, activeMs: 110, recoveryMs: 260, cooldownMs: 60 },
        hit: {
          damage: 13,
          guardDamage: 18,
          meterGain: 9,
          meterCost: 0,
          stunMs: 330,
          pushback: 5.4,
          launch: 2.6,
          hitAdvantageMs: 120,
          blockAdvantageMs: -110,
          cancellableInto: ["special", "dash"],
          comboTags: ["launcher", "heavy", "air-to-ground"]
        }
      },
      guard: {
        id: "mara.pulse-guard",
        name: "Pulse Guard",
        input: "guard",
        kind: "guard",
        range: "close",
        description: "A compact electric guard that stores a little meter during pressure.",
        gameplayNote: "Lower guard durability than Sable or Rook but stronger punish tempo.",
        accessibilityCue: "HUD guard chip changes state without relying on color alone.",
        vfxMotifs: ["tight cyan shield", "single emerald pulse"],
        frame: { startupMs: 40, activeMs: 240, recoveryMs: 120, cooldownMs: 80 },
        hit: {
          damage: 0,
          guardDamage: 0,
          meterGain: 6,
          meterCost: 0,
          stunMs: 0,
          pushback: 1.2,
          launch: 0,
          hitAdvantageMs: 40,
          blockAdvantageMs: 80,
          cancellableInto: ["light", "dash"],
          comboTags: ["guard", "meter"]
        }
      },
      dash: {
        id: "mara.surge-dash",
        name: "Surge Dash",
        input: "dash",
        kind: "movement",
        range: "mid",
        description: "A low electric burst that closes space and leaves a cyan afterimage.",
        gameplayNote: "Repositions before pressure; reduced-motion mode should soften the streak.",
        accessibilityCue: "Position change is paired with a dash state chip.",
        vfxMotifs: ["afterimage", "floor spark"],
        frame: { startupMs: 50, activeMs: 120, recoveryMs: 150, cooldownMs: 120 },
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
          comboTags: ["movement", "entry"]
        }
      }
    },
    signature: {
      id: "mara.volt-step",
      name: "Volt Step",
      input: "special",
      kind: "rushdown",
      range: "mid",
      description: "A blink-step cross-up that hits once and snaps Mara back into stance.",
      gameplayNote: "Consumes meter in the current app as the character Aura Burst.",
      accessibilityCue: "Combat log names Volt Step and reduced flash can suppress the burst.",
      vfxMotifs: ["cyan cross-up line", "emerald afterimage", "impact ring"],
      frame: { startupMs: 180, activeMs: 120, recoveryMs: 300, cooldownMs: 180 },
      hit: {
        damage: 23,
        guardDamage: 28,
        meterGain: 0,
        meterCost: 35,
        stunMs: 460,
        pushback: 7.5,
        launch: 1.4,
        hitAdvantageMs: 190,
        blockAdvantageMs: -90,
        cancellableInto: [],
        comboTags: ["special", "finisher", "side-switch"]
      }
    }
  },
  routeTags: ["playable", "evidence", "accessibility", "poster", "home"],
  contentNotes: [
    {
      rule: "original-ip",
      note: "Mara Volt is an original Aura Clash fighter with no real-person likeness dependency."
    },
    {
      rule: "typed-asset",
      note: "Use assets.fighterMaraVolt through the generated typed asset manifest."
    },
    {
      rule: "reduced-flash-safe",
      note: "Volt Step must remain readable when high-energy flashes are disabled."
    }
  ]
} as const satisfies AuraClashFighterDefinition;

