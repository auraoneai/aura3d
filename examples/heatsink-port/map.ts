/**
 * Vesper Heights map data, transcribed mechanically from the captured HEATSINK module by
 * tests/fixtures/crayon/heatsink/extract-map.mjs (a strict literal-only AST walk; no captured code is evaluated)
 * and tests/fixtures/crayon/heatsink/vesper.map.json. Regenerate rather than edit by hand.
 */
export interface Districts { [key: string]: { name: string; hw: number; ceil: number; heat: number; cool: number; light: number; road: number[]; fog: number; hud: { color: string; label: string }; lava?: boolean; water?: boolean; env?: Record<string, number> } }

export const VESPER = {
 "id": "vesper",
 "name": "Vesper Heights",
 "shape": {
  "seed": 31,
  "radius": 1100,
  "step": 2,
  "controlPoints": 32,
  "harmonics": [],
  "jitter": 0,
  "points": [
   [
    656,
    512
   ],
   [
    448,
    360
   ],
   [
    224,
    180
   ],
   [
    -224,
    -180
   ],
   [
    -448,
    -336
   ],
   [
    -688,
    -416
   ],
   [
    -896,
    -336
   ],
   [
    -1008,
    -144
   ],
   [
    -976,
    72
   ],
   [
    -848,
    208
   ],
   [
    -664,
    272
   ],
   [
    -448,
    264
   ],
   [
    -240,
    184
   ],
   [
    240,
    -184
   ],
   [
    464,
    -344
   ],
   [
    688,
    -448
   ],
   [
    912,
    -400
   ],
   [
    1064,
    -240
   ],
   [
    1104,
    -32
   ],
   [
    1040,
    176
   ],
   [
    888,
    320
   ],
   [
    696,
    304
   ],
   [
    608,
    160
   ],
   [
    656,
    16
   ],
   [
    944,
    40
   ],
   [
    1240,
    96
   ],
   [
    1320,
    304
   ],
   [
    1200,
    512
   ],
   [
    944,
    608
   ],
   [
    784,
    584
   ]
  ],
  "startPoint": 0,
  "smoothing": {
   "samples": 1400,
   "passes": 5,
   "window": 3,
   "refitEvery": 6,
   "arcDivisions": 4000,
   "refitArcDivisions": 8000
  },
  "startSearch": {
   "window": 400
  },
  "curvatureWindow": 5
 },
 "elevation": {
  "keys": [
   [
    0,
    0
   ],
   [
    2,
    0
   ],
   [
    3,
    0
   ],
   [
    5,
    0
   ],
   [
    6,
    2
   ],
   [
    7,
    10
   ],
   [
    8,
    22
   ],
   [
    9,
    32
   ],
   [
    10,
    36
   ],
   [
    12,
    36
   ],
   [
    12.3,
    36
   ],
   [
    12.7,
    36
   ],
   [
    13,
    36
   ],
   [
    14,
    37
   ],
   [
    15,
    46
   ],
   [
    16,
    62
   ],
   [
    17,
    76
   ],
   [
    18,
    80
   ],
   [
    19,
    80
   ],
   [
    20,
    74
   ],
   [
    21,
    64
   ],
   [
    22,
    56
   ],
   [
    23,
    48
   ],
   [
    24,
    44
   ],
   [
    25,
    36
   ],
   [
    26,
    26
   ],
   [
    27,
    14
   ],
   [
    28,
    5
   ],
   [
    29,
    1
   ]
  ],
  "keySmooth": 70,
  "waves": [],
  "jumps": [],
  "rampUp": 70,
  "rampDown": 12
 },
 "districts": {
  "valley": {
   "name": "Bonewake Causeway",
   "hw": 40,
   "ceil": 0,
   "heat": 1,
   "cool": 1,
   "light": 1,
   "road": [
    0.3,
    0.31,
    0.33
   ],
   "fog": 9074872,
   "hud": {
    "color": "#c9a0ff",
    "label": "BONEWAKE CAUSEWAY"
   }
  },
  "switchback": {
   "name": "Shard Ascent",
   "hw": 38,
   "ceil": 0,
   "heat": 1.1,
   "cool": 1,
   "light": 1,
   "road": [
    0.3,
    0.31,
    0.33
   ],
   "fog": 9074872,
   "hud": {
    "color": "#ff7ae0",
    "label": "SHARD ASCENT"
   }
  },
  "terrace": {
   "name": "Luminous Reef",
   "hw": 38,
   "ceil": 0,
   "heat": 1,
   "cool": 1,
   "light": 1,
   "road": [
    0.3,
    0.31,
    0.33
   ],
   "fog": 9074872,
   "hud": {
    "color": "#9f8cff",
    "label": "LUMINOUS REEF"
   }
  },
  "bridge": {
   "name": "Rift Crossing",
   "hw": 36,
   "ceil": 0,
   "heat": 1,
   "cool": 1.2,
   "light": 1,
   "road": [
    0.3,
    0.31,
    0.33
   ],
   "fog": 9074872,
   "hud": {
    "color": "#40e0ff",
    "label": "RIFT CROSSING"
   }
  },
  "ramp": {
   "name": "Crown Rise",
   "hw": 38,
   "ceil": 0,
   "heat": 1.2,
   "cool": 0.9,
   "light": 1,
   "road": [
    0.3,
    0.31,
    0.33
   ],
   "fog": 9074872,
   "hud": {
    "color": "#ff5ab4",
    "label": "CROWN RISE"
   }
  },
  "sky": {
   "name": "Astral Shelf",
   "hw": 36,
   "ceil": 0,
   "heat": 1,
   "cool": 1.3,
   "light": 1.05,
   "road": [
    0.3,
    0.31,
    0.33
   ],
   "fog": 10127560,
   "hud": {
    "color": "#7fe8ff",
    "label": "ASTRAL SHELF"
   }
  },
  "spiral": {
   "name": "Resonance Well",
   "hw": 38,
   "ceil": 0,
   "heat": 1,
   "cool": 1,
   "light": 0.95,
   "road": [
    0.3,
    0.31,
    0.33
   ],
   "fog": 8022184,
   "hud": {
    "color": "#b46cff",
    "label": "RESONANCE WELL"
   }
  },
  "exit": {
   "name": "Echo Return",
   "hw": 40,
   "ceil": 0,
   "heat": 1,
   "cool": 1,
   "light": 1,
   "road": [
    0.3,
    0.31,
    0.33
   ],
   "fog": 9074872,
   "hud": {
    "color": "#ffb02e",
    "label": "ECHO RETURN"
   }
  }
 },
 "sectionsAt": "points",
 "sections": [
  [
   0,
   "valley"
  ],
  [
   6.4,
   "switchback"
  ],
  [
   9.6,
   "terrace"
  ],
  [
   12.3,
   "bridge"
  ],
  [
   12.7,
   "terrace"
  ],
  [
   14.6,
   "ramp"
  ],
  [
   17.5,
   "sky"
  ],
  [
   20.3,
   "spiral"
  ],
  [
   24.6,
   "exit"
  ]
 ],
 "widthBlend": 80,
 "ceilingBlend": 60,
 "grid": {
  "x": 10,
  "row": 18
 },
 "splits": [
  {
   "s": 1080,
   "len": 600,
   "up": 14,
   "down": 10,
   "widen": 24,
   "divider": 9,
   "ramp": 140
  },
  {
   "s": 6520,
   "len": 600,
   "up": 12,
   "down": 11,
   "widen": 24,
   "divider": 9,
   "ramp": 140
  }
 ],
 "gameplay": {
  "clear": {
   "jump": 220,
   "startAfter": 220,
   "endBefore": 140,
   "obstacleHx": 6
  },
  "obstacles": [],
  "scatter": {
   "start": 90,
   "endMargin": 60,
   "step": 30,
   "rules": [
    {
     "type": "boostPad",
     "districts": [
      "valley",
      "terrace",
      "sky",
      "exit",
      "bridge"
     ],
     "chance": 0.09,
     "lateral": [
      0.15,
      0.45
     ],
     "clear": 30,
     "minGap": 260
    },
    {
     "type": "pickup",
     "districts": "all",
     "chance": 0.05,
     "lateral": 0.6,
     "clear": 24,
     "minGap": 300,
     "kinds": [
      "shield",
      "cool"
     ],
     "h": 2.2
    },
    {
     "type": "barrels",
     "districts": [
      "valley",
      "exit"
     ],
     "chance": 0.04,
     "clearEdge": 4,
     "clear": 25,
     "minGap": 240,
     "count": 3,
     "spacing": 2.2,
     "edgeInset": 3,
     "stagger": 1.6
    }
   ]
  },
  "checkpoints": {
   "offset": 25,
   "skipCovered": true
  },
  "pickupVisual": {
   "shield": "shield_pickup",
   "cool": "cooling_canister",
   "y": 1.2,
   "scale": 1.3
  },
  "barrelVisual": {
   "asset": "explosive_barrel"
  },
  "itemBoxes": {
   "rows": 6,
   "firstAt": 0.5,
   "search": 260,
   "searchStep": 10,
   "keepOut": {
    "start": 280,
    "end": 180,
    "roofCheck": 70,
    "jump": 120,
    "boostPad": 60,
    "pickup": 50
   },
   "wideRoad": 18,
   "wideCount": 7,
   "narrowCount": 5,
   "edgeInset": 7,
   "y": 2.4,
   "clear": {
    "hs": 8,
    "hx": 3
   }
  },
  "extraObstacles": [],
  "extraLavaPools": [],
  "extraBoostPads": [
   {
    "s": 1300,
    "x": -26
   },
   {
    "s": 1460,
    "x": -24
   },
   {
    "s": 6740,
    "x": -26
   },
   {
    "s": 6900,
    "x": -24
   }
  ],
  "extraPickups": [],
  "extraBarrels": [],
  "extraCheckpoints": []
 },
 "lighting": {
  "aoStrength": 0.8,
  "exposure": 1.02,
  "sky": {
   "zenith": [
    0.004,
    0.009,
    0.035
   ],
   "mid": [
    0.018,
    0.055,
    0.095
   ],
   "horizon": [
    0.11,
    0.23,
    0.28
   ],
   "glow": [
    0.35,
    0.24,
    0.32
   ],
   "sunDir": [
    0.55,
    0.23,
    -0.62
   ],
   "sunColor": [
    2.5,
    1.4,
    1
   ],
   "cloudSpeed": 0.0012,
   "clouds": 0.055,
   "cloudLit": [
    0.9,
    0.8,
    1.1
   ],
   "horizonBand": 0.12,
   "below": [
    0.06,
    0.16,
    0.19
   ],
   "moon": {
    "dir": [
     0.65,
     0.3,
     0.7
    ],
    "size": 0.026,
    "color": [
     1,
     1.1,
     1.5
    ],
    "phase": 0.5
   },
   "alien": {
    "aurora": 1.35,
    "planet": {
     "dir": [
      -0.68,
      0.42,
      -0.72
     ],
     "size": 0.17,
     "haze": 0.32
    }
   }
  },
  "sun": {
   "color": 16769244,
   "intensity": 2.9,
   "dir": [
    0.55,
    0.23,
    -0.62
   ]
  },
  "hemi": {
   "sky": 9616850,
   "ground": 3354695,
   "intensity": 1
  },
  "environmentIntensity": 0.65,
  "grade": {
   "saturation": 1.08,
   "contrast": 1.08
  },
  "bloom": {
   "strength": 0.28,
   "radius": 0.4,
   "threshold": 1.5
  }
 },
 "atmosphere": {
  "cool": [
   0.1,
   0.16,
   0.25
  ],
  "warm": [
   0.3,
   0.19,
   0.25
  ],
  "low": [
   0.06,
   0.19,
   0.21
  ],
  "drift": true,
  "start": 150,
  "density": 0.0004,
  "hDensity": 0.0022,
  "hBase": 18,
  "hFalloff": 0.031,
  "maxFog": 0.96
 },
 "fx": {
  "dust": {
   "color": [
    0.38,
    0.65,
    0.7
   ],
   "wake": 0.5,
   "hover": 0.12,
   "aiShare": 0.6,
   "slide": 0.8,
   "skipCovered": false
  }
 }
} as const;
