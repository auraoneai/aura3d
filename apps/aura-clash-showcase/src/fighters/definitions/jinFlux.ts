import {
  fighterAssetReference,
  type AuraClashFighterDefinition
} from "../FighterDefinition";

export const jinFlux = {
  id: "jin",
  name: "Jin Flux",
  metadata: {
    slot: 6,
    callsign: "Ring control",
    title: "Midrange zoner",
    slug: "jin-flux",
    rosterGroup: "Aura Clash Originals",
    role: "original playable fighter",
    archetype: "Energy arcs, spacing traps, meter routes",
    designPillar:
      "Meter-forward zoner with visible ring projectiles and strong route evidence for the HUD."
  },
  asset: fighterAssetReference("jin", "fighter-jin-flux"),
  stats: {
    maxHealth: 100,
    maxGuard: 100,
    startingMeter: 46,
    meterCap: 100,
    attack: 76,
    defense: 70,
    speed: 74,
    technique: 90,
    range: 94,
    guardPressure: 80,
    meterBuild: 94,
    weight: 60
  },
  comboTuning: {
    maxPracticalHits: 8,
    hitConfirmWindowMs: 280,
    cancelWindowMs: 170,
    resetWindowMs: 860,
    baseDamageScaling: [1, 0.89, 0.77, 0.65, 0.53],
    hitstunDecayPerHit: 0.065,
    guardPressureDecayPerHit: 0.055,
    meterGainMultiplier: 1.18,
    routes: [
      {
        id: "jin.ring-check",
        label: "Ring Check",
        starter: "light",
        sequence: ["light", "heavy", "special"],
        targetDamage: 33,
        meterSwing: 14,
        difficulty: "starter",
        notes: "Simple midrange check into the named Flux Ring special."
      },
      {
        id: "jin.orbit-trap",
        label: "Orbit Trap",
        starter: "dash",
        sequence: ["dash", "heavy", "light", "special"],
        targetDamage: 36,
        meterSwing: 12,
        difficulty: "standard",
        notes: "Dash changes ring angle before a trap-style heavy confirm."
      },
      {
        id: "jin.meter-lattice",
        label: "Meter Lattice",
        starter: "guard",
        sequence: ["guard", "light", "heavy", "special"],
        targetDamage: 34,
        meterSwing: 17,
        difficulty: "advanced",
        notes: "Maximizes meter economy while keeping the combo counter active."
      }
    ]
  },
  visualProfile: {
    palette: {
      displayName: "Blue / gold",
      primary: "#0F1E46",
      secondary: "#FDE68A",
      accent: "#2563EB",
      aura: "#FBBF24",
      hud: "#93C5FD"
    },
    silhouette: [
      "Open palm ring stance",
      "Floating shoulder halo",
      "Long midrange arm lines",
      "Gold orbital floor marks"
    ],
    materials: [
      "deep blue coat panels",
      "gold ring glyphs",
      "transparent energy hoops",
      "polished dark boots"
    ],
    motifs: [
      "flux rings",
      "orbital arcs",
      "blue vector rails",
      "gold meter pips"
    ],
    idlePose:
      "Keeps one palm open while a small gold ring orbits between both hands.",
    introPose:
      "Draws a blue-gold ring from the floor and sends it spinning around center stage.",
    victoryPose:
      "Stacks three flux rings overhead until they lock into a bright halo.",
    portrait: {
      camera: "Midrange caster profile with floating ring",
      background: "Blue rooftop geometry with gold orbit lines",
      expression: "Calm and calculating"
    },
    vfx: {
      aura: "Gold orbital rings over a blue rim light",
      trail: "Thin vector lines and rotating pips",
      impact: "Ring pop with clean blue vector sparks",
      guard: "Circular gold meter shield",
      signature: "Flux Ring projectile trap that expands on contact"
    }
  },
  moveKit: {
    archetype: "Energy arcs, spacing traps, meter routes",
    combatStyleTags: ["zoner", "midrange", "meter", "trap"],
    baseAttacks: {
      light: {
        id: "jin.ring-jab",
        name: "Ring Jab",
        input: "light",
        kind: "strike",
        range: "mid",
        description: "A palm jab sends a small ring forward just beyond close range.",
        gameplayNote: "Best light range on the roster but slightly lower reward on hit.",
        accessibilityCue: "The ring location makes range readable for keyboard players.",
        vfxMotifs: ["small gold ring", "blue pip"],
        frame: { startupMs: 90, activeMs: 90, recoveryMs: 150, cooldownMs: 40 },
        hit: {
          damage: 7,
          guardDamage: 9,
          meterGain: 8,
          meterCost: 0,
          stunMs: 190,
          pushback: 4.4,
          launch: 0.1,
          hitAdvantageMs: 85,
          blockAdvantageMs: -45,
          cancellableInto: ["heavy", "special", "dash"],
          comboTags: ["starter", "midrange", "meter"]
        }
      },
      heavy: {
        id: "jin.arc-splitter",
        name: "Arc Splitter",
        input: "heavy",
        kind: "areaControl",
        range: "long",
        description: "A blue-gold arc cuts the mid lane and leaves a short trap ring.",
        gameplayNote: "Controls space and confirms into Flux Ring at mid distance.",
        accessibilityCue: "Arc start and end points are clearly visible.",
        vfxMotifs: ["long arc", "trap ring"],
        frame: { startupMs: 170, activeMs: 130, recoveryMs: 290, cooldownMs: 80 },
        hit: {
          damage: 13,
          guardDamage: 20,
          meterGain: 9,
          meterCost: 0,
          stunMs: 360,
          pushback: 6.2,
          launch: 1.3,
          hitAdvantageMs: 130,
          blockAdvantageMs: -115,
          cancellableInto: ["special", "dash"],
          comboTags: ["heavy", "trap", "midrange"]
        }
      },
      guard: {
        id: "jin.gyro-guard",
        name: "Gyro Guard",
        input: "guard",
        kind: "guard",
        range: "close",
        description: "A rotating ring shield absorbs impact and converts it to meter pips.",
        gameplayNote: "Meter-positive guard, weaker than Sable but stronger for route economy.",
        accessibilityCue: "Meter pips and guard state chip both update after block.",
        vfxMotifs: ["rotating ring", "gold pips"],
        frame: { startupMs: 50, activeMs: 250, recoveryMs: 140, cooldownMs: 100 },
        hit: {
          damage: 0,
          guardDamage: 0,
          meterGain: 8,
          meterCost: 0,
          stunMs: 0,
          pushback: 1.6,
          launch: 0,
          hitAdvantageMs: 60,
          blockAdvantageMs: 105,
          cancellableInto: ["light", "heavy", "special"],
          comboTags: ["guard", "meter", "setup"]
        }
      },
      dash: {
        id: "jin.orbit-dash",
        name: "Orbit Dash",
        input: "dash",
        kind: "movement",
        range: "mid",
        description: "A curved reposition around a faint gold orbit mark.",
        gameplayNote: "Good for maintaining spacing rather than pure rushdown.",
        accessibilityCue: "Curved floor ring remains visible when motion is reduced.",
        vfxMotifs: ["orbit mark", "blue vector dash"],
        frame: { startupMs: 60, activeMs: 125, recoveryMs: 145, cooldownMs: 120 },
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
          comboTags: ["movement", "spacing", "meter"]
        }
      }
    },
    signature: {
      id: "jin.flux-ring",
      name: "Flux Ring",
      input: "special",
      kind: "projectile",
      range: "long",
      description: "A large blue-gold ring expands forward, then collapses into a meter burst.",
      gameplayNote: "Current-app Aura Burst with the strongest meter-route identity.",
      accessibilityCue: "The expanding ring is readable at a distance and named in the combat log.",
      vfxMotifs: ["large flux ring", "gold meter burst", "blue vector sparks"],
      frame: { startupMs: 200, activeMs: 180, recoveryMs: 310, cooldownMs: 180 },
      hit: {
        damage: 22,
        guardDamage: 32,
        meterGain: 0,
        meterCost: 35,
        stunMs: 480,
        pushback: 8,
        launch: 1.2,
        hitAdvantageMs: 180,
        blockAdvantageMs: -90,
        cancellableInto: [],
        comboTags: ["special", "projectile", "meter-route"]
      }
    }
  },
  routeTags: ["playable", "evidence", "accessibility", "poster", "home"],
  contentNotes: [
    {
      rule: "original-ip",
      note: "Jin Flux is an original midrange zoner for Aura Clash."
    },
    {
      rule: "typed-asset",
      note: "Use fighter.asset.typedAssetMember, which resolves to a final Aura Clash release rig in the generated typed asset manifest."
    },
    {
      rule: "readable-hud",
      note: "Flux Ring should always have text-backed meter and combo feedback."
    }
  ]
} as const satisfies AuraClashFighterDefinition;
