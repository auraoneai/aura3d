import {
  fighterAssetReference,
  type AuraClashFighterDefinition
} from "../FighterDefinition";

export const sableIron = {
  id: "sable",
  name: "Sable Iron",
  metadata: {
    slot: 5,
    callsign: "Counter wall",
    title: "Defensive tactician",
    slug: "sable-iron",
    rosterGroup: "Aura Clash Originals",
    role: "original playable fighter",
    archetype: "Parry windows, guard return, heavy counter",
    designPillar:
      "Defensive specialist for proving guard, reduced flash, and counter-readable HUD states."
  },
  asset: fighterAssetReference("sable", "fighter-sable-iron"),
  stats: {
    maxHealth: 100,
    maxGuard: 100,
    startingMeter: 30,
    meterCap: 100,
    attack: 74,
    defense: 94,
    speed: 52,
    technique: 88,
    range: 61,
    guardPressure: 84,
    meterBuild: 76,
    weight: 88
  },
  comboTuning: {
    maxPracticalHits: 6,
    hitConfirmWindowMs: 300,
    cancelWindowMs: 140,
    resetWindowMs: 960,
    baseDamageScaling: [1, 0.93, 0.82, 0.7, 0.58],
    hitstunDecayPerHit: 0.045,
    guardPressureDecayPerHit: 0.03,
    meterGainMultiplier: 1,
    routes: [
      {
        id: "sable.parry-return",
        label: "Parry Return",
        starter: "guard",
        sequence: ["guard", "heavy", "special"],
        targetDamage: 38,
        meterSwing: 9,
        difficulty: "starter",
        notes: "Primary route starts from the Q guard state already exposed by the current app."
      },
      {
        id: "sable.wall-check",
        label: "Wall Check",
        starter: "light",
        sequence: ["light", "guard", "heavy", "special"],
        targetDamage: 35,
        meterSwing: 12,
        difficulty: "standard",
        notes: "Alternates a poke with guard return so Sable does not feel like a rushdown clone."
      },
      {
        id: "sable.iron-discipline",
        label: "Iron Discipline",
        starter: "heavy",
        sequence: ["heavy", "guard", "heavy", "special"],
        targetDamage: 46,
        meterSwing: 4,
        difficulty: "advanced",
        notes: "Slow expert route that rewards exact counter timing."
      }
    ]
  },
  visualProfile: {
    palette: {
      displayName: "Graphite / ice",
      primary: "#111827",
      secondary: "#E0F2FE",
      accent: "#64748B",
      aura: "#93C5FD",
      hud: "#BAE6FD"
    },
    silhouette: [
      "Tall guarded stance",
      "Crossed forearm blocks",
      "Graphite shoulder plates",
      "Ice-blue counter halo"
    ],
    materials: [
      "graphite tactical cloth",
      "ice glass guard panels",
      "brushed steel edges",
      "blue-white parry glints"
    ],
    motifs: [
      "iron wall glyphs",
      "counter ticks",
      "ice-blue shields",
      "graphite chevrons"
    ],
    idlePose:
      "Keeps both arms high while an ice-blue guard halo rotates behind the shoulders.",
    introPose:
      "Steps through a graphite shield outline and lets it lock into place at center stage.",
    victoryPose:
      "Turns sideways as three guard panels close like a vault door.",
    portrait: {
      camera: "Tall defensive three-quarter portrait",
      background: "Graphite panels with ice-blue shield light",
      expression: "Measured and unreadable"
    },
    vfx: {
      aura: "Thin ice-blue perimeter shield",
      trail: "Graphite afterbars with cold edge light",
      impact: "Blue-white counter flash and metal tick marks",
      guard: "Large readable ice wall with numbered stress ticks",
      signature: "Iron Wall counter field that rebounds impact as an ice-blue shock"
    }
  },
  moveKit: {
    archetype: "Parry windows, guard return, heavy counter",
    combatStyleTags: ["defense", "counter", "guard", "tactician"],
    baseAttacks: {
      light: {
        id: "sable.iron-tap",
        name: "Iron Tap",
        input: "light",
        kind: "strike",
        range: "close",
        description: "A measured glove tap that checks approach without overcommitting.",
        gameplayNote: "Average startup with low risk and strong counter setup.",
        accessibilityCue: "Small hit cue keeps Sable's defensive identity readable.",
        vfxMotifs: ["steel tick", "ice fleck"],
        frame: { startupMs: 90, activeMs: 80, recoveryMs: 150, cooldownMs: 40 },
        hit: {
          damage: 7,
          guardDamage: 10,
          meterGain: 6,
          meterCost: 0,
          stunMs: 190,
          pushback: 3.5,
          launch: 0.1,
          hitAdvantageMs: 80,
          blockAdvantageMs: -30,
          cancellableInto: ["guard", "heavy", "special"],
          comboTags: ["starter", "counter-setup"]
        }
      },
      heavy: {
        id: "sable.cold-hammer",
        name: "Cold Hammer",
        input: "heavy",
        kind: "counter",
        range: "mid",
        description: "A heavy forearm counter that lands best after a blocked rival action.",
        gameplayNote: "Strong hit advantage when used from guard routes.",
        accessibilityCue: "The counter flash has a clear low-flash alternative.",
        vfxMotifs: ["ice-blue counter", "graphite hammer arc"],
        frame: { startupMs: 170, activeMs: 120, recoveryMs: 280, cooldownMs: 70 },
        hit: {
          damage: 15,
          guardDamage: 20,
          meterGain: 8,
          meterCost: 0,
          stunMs: 390,
          pushback: 6,
          launch: 1.4,
          hitAdvantageMs: 140,
          blockAdvantageMs: -105,
          cancellableInto: ["special", "guard"],
          comboTags: ["heavy", "counter", "guard-return"]
        }
      },
      guard: {
        id: "sable.frost-parry",
        name: "Frost Parry",
        input: "guard",
        kind: "guard",
        range: "close",
        description: "A timed ice wall that turns pressure into meter and counter advantage.",
        gameplayNote: "Most rewarding guard state but requires better timing than Rook's slab.",
        accessibilityCue: "Panel opacity and HUD chip make the parry window explicit.",
        vfxMotifs: ["ice panel", "counter ticks"],
        frame: { startupMs: 35, activeMs: 250, recoveryMs: 140, cooldownMs: 100 },
        hit: {
          damage: 0,
          guardDamage: 0,
          meterGain: 8,
          meterCost: 0,
          stunMs: 0,
          pushback: 2,
          launch: 0,
          hitAdvantageMs: 70,
          blockAdvantageMs: 130,
          cancellableInto: ["heavy", "special"],
          comboTags: ["guard", "parry", "meter"]
        }
      },
      dash: {
        id: "sable.brace-step",
        name: "Brace Step",
        input: "dash",
        kind: "movement",
        range: "mid",
        description: "A short guarded reposition that keeps Sable's arms high.",
        gameplayNote: "Defensive dash with less forward range and better recovery.",
        accessibilityCue: "State chip changes to dash while the guard silhouette remains visible.",
        vfxMotifs: ["graphite slide", "ice heel mark"],
        frame: { startupMs: 60, activeMs: 100, recoveryMs: 130, cooldownMs: 120 },
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
          cancellableInto: ["guard", "light"],
          comboTags: ["movement", "defense"]
        }
      }
    },
    signature: {
      id: "sable.iron-wall",
      name: "Iron Wall",
      input: "special",
      kind: "counter",
      range: "mid",
      description: "A full-body counter field absorbs a beat, then returns an ice-blue shock.",
      gameplayNote: "Defensive Aura Burst with strong guard return and lower raw damage.",
      accessibilityCue: "The wall has a clear silhouette and non-flash counter pulse.",
      vfxMotifs: ["ice wall", "graphite vault", "counter shock"],
      frame: { startupMs: 160, activeMs: 210, recoveryMs: 320, cooldownMs: 190 },
      hit: {
        damage: 20,
        guardDamage: 34,
        meterGain: 0,
        meterCost: 35,
        stunMs: 500,
        pushback: 8.4,
        launch: 1,
        hitAdvantageMs: 170,
        blockAdvantageMs: -70,
        cancellableInto: [],
        comboTags: ["special", "counter", "guard-break"]
      }
    }
  },
  routeTags: ["playable", "evidence", "accessibility", "poster", "home"],
  contentNotes: [
    {
      rule: "original-ip",
      note: "Sable Iron is an original defensive tactician for Aura Clash."
    },
    {
      rule: "typed-asset",
      note: "Use fighter.asset.typedAssetMember, which resolves to a final Aura Clash release rig in the generated typed asset manifest."
    },
    {
      rule: "reduced-flash-safe",
      note: "Counter flashes need a low-intensity ice wall fallback."
    }
  ]
} as const satisfies AuraClashFighterDefinition;
