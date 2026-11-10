import {
  instances,
  lights,
  primitives,
  type AuraColor,
  type AuraNodeBuilder,
  type AuraSceneNode,
  type AuraTransformSpec
} from "@aura3d/engine";
import { path2d } from "@aura3d/engine/procedural";
import {
  brushedMetalMat,
  ceramicMat,
  clayMat,
  clearGlassMat,
  dioramaGroup,
  extrudeContour,
  fabricMat,
  feltMat,
  instanceWoodMat,
  tubeAlongSpline,
  warmPracticalGlowMat,
  woodMat
} from "./diorama-terrain.js";
import type { Vec3 } from "./motion.js";
import type { WorldAnimatedNodeSpec, WorldDefinition, WorldDioramaSlice } from "./worlds.js";

const MOLDING_PROFILE = path2d()
  .moveTo(-0.05, -0.04)
  .lineTo(-0.05, 0.06)
  .lineTo(0.03, 0.06)
  .quadTo(0.06, 0.06, 0.06, 0.02)
  .lineTo(0.06, -0.04)
  .close()
  .points({ curveSegments: 3 });

function buildHomeNookDiorama(): WorldDioramaSlice {
  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [];
  const animated: WorldAnimatedNodeSpec[] = [];

  // 1. Honey-oak plank floor (flush top at y = 0.000) + bevelled room plinth
  nodes.push(
    primitives.box({
      name: "nook subfloor plinth",
      size: [12.4, 0.26, 11.4],
      position: [0, -0.15, 0.4],
      material: woodMat("#B98452", false),
      castShadow: false,
      receiveShadow: true
    })
  );

  const plankTransforms: AuraTransformSpec[] = [];
  const plankColors: AuraColor[] = [];
  const oakTones: readonly AuraColor[] = ["#DCA974", "#D39E68", "#E3B27E", "#CCA070", "#DAA56F"];
  const plankCount = 26;
  const plankWidth = 0.46;
  for (let i = 0; i < plankCount; i += 1) {
    const x = (i - (plankCount - 1) * 0.5) * plankWidth;
    plankTransforms.push({
      position: [x, -0.018, 0.4]
    });
    plankColors.push(oakTones[i % oakTones.length]!);
  }
  nodes.push(
    instances.roundedBox({
      name: "nook honey oak floor planks",
      size: [plankWidth - 0.012, 0.036, 11.0],
      material: instanceWoodMat("#FFFFFF"),
      transforms: plankTransforms,
      colors: plankColors,
      castShadow: false,
      receiveShadow: true
    })
  );

  // 2. Woven terracotta & cream felt area rug (total height <= 0.014m so cast stand flush)
  nodes.push(
    primitives.cylinder({
      name: "nook woven terracotta rug outer",
      size: [4.4, 0.01, 3.15],
      position: [0, 0.005, 0.1],
      material: feltMat("#E6A079", false),
      castShadow: false,
      receiveShadow: true
    }),
    primitives.cylinder({
      name: "nook woven cream rug inner",
      size: [3.65, 0.012, 2.55],
      position: [0, 0.007, 0.1],
      material: feltMat("#F8E9D4", false),
      castShadow: false,
      receiveShadow: true
    }),
    primitives.cylinder({
      name: "nook woven sage rug center",
      size: [2.15, 0.013, 1.5],
      position: [0, 0.008, 0.1],
      material: feltMat("#DCE5D0", false),
      castShadow: false,
      receiveShadow: true
    })
  );

  // 3. Cream-plaster walls (tall & wide so portrait and ultrawide stay inside the room) + wainscoting & crown molding
  const wallPlaster = clayMat("#FAF0DF", false);
  const wainscotCream = clayMat("#EFE1CA", false);
  const trimWood = woodMat("#DFC7A7", false);

  nodes.push(
    primitives.box({
      name: "nook back wall left",
      size: [3.95, 6.2, 0.22],
      position: [-4.22, 3.1, -4.35],
      material: wallPlaster,
      castShadow: false,
      receiveShadow: true
    }),
    primitives.box({
      name: "nook back wall right",
      size: [6.35, 6.2, 0.22],
      position: [3.02, 3.1, -4.35],
      material: wallPlaster,
      castShadow: false,
      receiveShadow: true
    }),
    primitives.box({
      name: "nook back wall window apron",
      size: [2.14, 0.96, 0.22],
      position: [-1.2, 0.48, -4.35],
      material: wallPlaster,
      castShadow: false,
      receiveShadow: true
    }),
    primitives.box({
      name: "nook back wall window header",
      size: [2.14, 3.24, 0.22],
      position: [-1.2, 4.58, -4.35],
      material: wallPlaster,
      castShadow: false,
      receiveShadow: true
    }),
    primitives.box({
      name: "nook left wing wall",
      size: [0.22, 6.2, 11.4],
      position: [-6.05, 3.1, 1.2],
      material: wallPlaster,
      castShadow: false,
      receiveShadow: true
    }),
    primitives.box({
      name: "nook right wing wall",
      size: [0.22, 6.2, 11.4],
      position: [6.05, 3.1, 1.2],
      material: wallPlaster,
      castShadow: false,
      receiveShadow: true
    }),
    extrudeContour({
      name: "nook back dado rail",
      profile: MOLDING_PROFILE,
      from: [-5.95, 0.92, -4.22],
      to: [5.95, 0.92, -4.22],
      material: trimWood,
      castShadow: true
    }),
    extrudeContour({
      name: "nook back crown molding",
      profile: MOLDING_PROFILE,
      from: [-5.95, 3.88, -4.2],
      to: [5.95, 3.88, -4.2],
      material: trimWood,
      castShadow: false
    })
  );

  // Recessed wainscoting panels across back & side walls (1 draw call)
  const wainscotTransforms: AuraTransformSpec[] = [];
  for (let i = 0; i < 9; i += 1) {
    const x = -5.12 + i * 1.28;
    wainscotTransforms.push({ position: [x, 0.46, -4.22] });
  }
  for (let j = 0; j < 5; j += 1) {
    const z = -3.4 + j * 1.45;
    wainscotTransforms.push({ position: [-5.92, 0.46, z], rotation: [0, Math.PI * 0.5, 0] });
    wainscotTransforms.push({ position: [5.92, 0.46, z], rotation: [0, Math.PI * 0.5, 0] });
  }
  nodes.push(
    instances.roundedBox({
      name: "nook bevelled wainscoting panels",
      size: [1.08, 0.72, 0.04],
      material: instanceWoodMat("#EFE1CA"),
      transforms: wainscotTransforms,
      castShadow: false,
      receiveShadow: true
    })
  );

  // 4. Sunlit exterior garden diorama visible outside the arched window + mullions + pleated curtains
  nodes.push(
    primitives.box({
      name: "nook sunlit garden sky backdrop",
      size: [4.2, 3.4, 0.08],
      position: [-1.2, 2.1, -5.85],
      material: warmPracticalGlowMat("#DDF2FF", "#FFF4D8", 0.55),
      castShadow: false,
      receiveShadow: false
    }),
    primitives.sphere({
      name: "nook exterior garden bush left",
      size: [1.45, 1.05, 0.9],
      position: [-1.85, 1.18, -5.25],
      material: feltMat("#86C478", false),
      castShadow: false,
      receiveShadow: false
    }),
    primitives.sphere({
      name: "nook exterior garden bush right",
      size: [1.55, 1.15, 0.95],
      position: [-0.58, 1.24, -5.3],
      material: feltMat("#95CE82", false),
      castShadow: false,
      receiveShadow: false
    }),
    primitives.box({
      name: "nook honey oak window sill",
      size: [2.42, 0.08, 0.34],
      position: [-1.2, 0.95, -4.2],
      material: woodMat("#CFA06E"),
      castShadow: true,
      receiveShadow: true
    }),
    primitives.box({
      name: "nook window clear glass pane",
      size: [2.06, 1.96, 0.02],
      position: [-1.2, 1.95, -4.34],
      material: clearGlassMat("#EAF7FF"),
      castShadow: false,
      receiveShadow: false
    }),
    primitives.box({
      name: "nook window vertical mullion",
      size: [0.055, 1.96, 0.06],
      position: [-1.2, 1.95, -4.3],
      material: wainscotCream,
      castShadow: false,
      receiveShadow: false
    }),
    primitives.box({
      name: "nook window horizontal mullion",
      size: [2.06, 0.055, 0.06],
      position: [-1.2, 1.96, -4.3],
      material: wainscotCream,
      castShadow: false,
      receiveShadow: false
    }),
    tubeAlongSpline({
      name: "nook arched window casing",
      points: [
        [-2.24, 0.96, -4.24],
        [-2.24, 2.52, -4.24],
        [-1.85, 2.94, -4.24],
        [-1.2, 3.08, -4.24],
        [-0.55, 2.94, -4.24],
        [-0.16, 2.52, -4.24],
        [-0.16, 0.96, -4.24]
      ],
      radius: 0.055,
      segments: 36,
      radialSegments: 12,
      material: woodMat("#CFA06E")
    }),
    primitives.cylinder({
      name: "nook brass curtain rod",
      size: [0.04, 2.86, 0.04],
      position: [-1.2, 3.14, -4.1],
      rotation: [0, 0, Math.PI * 0.5],
      material: brushedMetalMat("#DFBA6E"),
      castShadow: true,
      receiveShadow: false
    })
  );

  const curtainMat = fabricMat("#F2AC95");
  const curtainConfigs: readonly { readonly id: string; readonly x: number; readonly phase: number }[] = [
    { id: "nook-curtain-left", x: -2.32, phase: 0 },
    { id: "nook-curtain-right", x: -0.08, phase: 1.4 }
  ];
  for (const c of curtainConfigs) {
    const restPos: Vec3 = [c.x, 2.0, -4.1];
    nodes.push(
      dioramaGroup(
        c.id,
        [
          primitives.cylinder({
            name: `${c.id}-pleat-1`,
            size: [0.16, 2.22, 0.12],
            position: [-0.09, 0, 0],
            material: curtainMat,
            castShadow: true,
            receiveShadow: true
          }),
          primitives.cylinder({
            name: `${c.id}-pleat-2`,
            size: [0.17, 2.22, 0.13],
            position: [0, 0, 0.02],
            material: curtainMat,
            castShadow: true,
            receiveShadow: true
          }),
          primitives.cylinder({
            name: `${c.id}-pleat-3`,
            size: [0.16, 2.22, 0.12],
            position: [0.09, 0, 0],
            material: curtainMat,
            castShadow: true,
            receiveShadow: true
          })
        ],
        { position: restPos }
      ).runtime({ id: c.id, tags: ["diorama", "curtain"], mutable: true })
    );
    animated.push({
      id: c.id,
      restPosition: restPos,
      restRotation: [0, 0, 0],
      sample: (t) => ({
        position: restPos,
        rotation: [0, 0, Math.sin(t * 0.75 + c.phase) * 0.018]
      })
    });
  }

  // 5. Real practical floor lamp (`lights.point`) + sunlit window spotlight (`lights.spot`)
  const lampPos: Vec3 = [3.58, 0, -3.22];
  nodes.push(
    primitives.cylinder({
      name: "nook floor lamp base",
      size: [0.46, 0.05, 0.46],
      position: [lampPos[0], 0.025, lampPos[2]],
      material: woodMat("#C7915D"),
      castShadow: true,
      receiveShadow: true
    }),
    primitives.cylinder({
      name: "nook floor lamp stem",
      size: [0.065, 1.72, 0.065],
      position: [lampPos[0], 0.88, lampPos[2]],
      material: woodMat("#C7915D"),
      castShadow: true,
      receiveShadow: true
    }),
    primitives.cone({
      name: "nook floor lamp warm linen shade",
      size: [0.58, 0.44, 0.58],
      position: [lampPos[0], 1.84, lampPos[2]],
      material: warmPracticalGlowMat("#FFF2D8", "#FFD596", 1.15),
      castShadow: false,
      receiveShadow: false
    }),
    lights.point({
      name: "nook floor lamp practical glow",
      position: [lampPos[0], 1.72, lampPos[2] + 0.08],
      color: "#FFE1AC",
      intensity: 2.15,
      distance: 7.5,
      decay: 2
    }),
    lights.spot({
      name: "nook sunlit window beam",
      position: [-1.2, 2.85, -4.05],
      target: [0.35, 0, 0.25],
      color: "#FFF2D2",
      intensity: 1.65,
      angle: 0.62,
      penumbra: 0.78,
      distance: 11,
      decay: 1.6
    })
  );

  // 6. Framed pastel relief wall art (abstract hills & sun — zero text or figures)
  nodes.push(
    dioramaGroup(
      "nook pastel relief frame 1",
      [
        primitives.box({
          name: "nook art frame 1 oak",
          size: [0.92, 0.74, 0.05],
          material: woodMat("#CEA06E"),
          castShadow: true,
          receiveShadow: true
        }),
        primitives.box({
          name: "nook art frame 1 sky mat",
          size: [0.78, 0.6, 0.06],
          position: [0, 0, 0.01],
          material: clayMat("#DCEBFA", false),
          castShadow: false,
          receiveShadow: true
        }),
        primitives.cylinder({
          name: "nook art frame 1 sun disc",
          size: [0.22, 0.02, 0.22],
          position: [0.16, 0.11, 0.04],
          rotation: [Math.PI * 0.5, 0, 0],
          material: ceramicMat("#FAD373", false),
          castShadow: false,
          receiveShadow: false
        }),
        primitives.sphere({
          name: "nook art frame 1 hill relief",
          size: [0.56, 0.24, 0.04],
          position: [-0.08, -0.14, 0.04],
          material: feltMat("#9AD0A6", false),
          castShadow: false,
          receiveShadow: false
        })
      ],
      { position: [1.45, 2.18, -4.21] }
    ),
    dioramaGroup(
      "nook pastel relief frame 2",
      [
        primitives.box({
          name: "nook art frame 2 oak",
          size: [0.72, 0.86, 0.05],
          material: woodMat("#CEA06E"),
          castShadow: true,
          receiveShadow: true
        }),
        primitives.box({
          name: "nook art frame 2 blush mat",
          size: [0.58, 0.72, 0.06],
          position: [0, 0, 0.01],
          material: clayMat("#F9E1E6", false),
          castShadow: false,
          receiveShadow: true
        }),
        primitives.torus({
          name: "nook art frame 2 rainbow arc",
          size: [0.34, 0.34, 0.05],
          position: [0, -0.04, 0.04],
          material: ceramicMat("#C8AEF4", false),
          castShadow: false,
          receiveShadow: false
        })
      ],
      { position: [2.62, 2.02, -4.21] }
    )
  );

  // 7. Honey-oak wooden toy cubby shelf + ceramic/wood miniatures + terracotta potted plant
  nodes.push(
    dioramaGroup(
      "nook wooden toy shelf",
      [
        primitives.box({
          name: "nook shelf cabinet",
          size: [1.38, 1.06, 0.42],
          position: [0, 0.53, 0],
          material: woodMat("#CFA06C"),
          castShadow: true,
          receiveShadow: true
        }),
        primitives.sphere({
          name: "nook shelf ceramic bowl",
          size: [0.22, 0.14, 0.22],
          position: [-0.34, 1.12, 0],
          material: ceramicMat("#94CAFA"),
          castShadow: true,
          receiveShadow: true
        }),
        primitives.cone({
          name: "nook shelf stacking tower",
          size: [0.2, 0.28, 0.2],
          position: [0.06, 1.2, 0],
          material: ceramicMat("#F6A4BE"),
          castShadow: true,
          receiveShadow: true
        }),
        primitives.cylinder({
          name: "nook shelf honey drum",
          size: [0.22, 0.18, 0.22],
          position: [0.4, 1.15, 0],
          material: ceramicMat("#FAD36E"),
          castShadow: true,
          receiveShadow: true
        })
      ],
      { position: [-3.72, 0, -3.55], rotation: [0, 0.16, 0] }
    ),
    dioramaGroup(
      "nook terracotta potted plant",
      [
        primitives.cylinder({
          name: "nook terracotta pot",
          size: [0.42, 0.38, 0.42],
          position: [0, 0.19, 0],
          material: clayMat("#D47E5A"),
          castShadow: true,
          receiveShadow: true
        }),
        primitives.sphere({
          name: "nook plant leaf cluster 1",
          size: [0.46, 0.36, 0.46],
          position: [0, 0.52, 0],
          material: feltMat("#78B874"),
          castShadow: true,
          receiveShadow: true
        }),
        primitives.sphere({
          name: "nook plant leaf cluster 2",
          size: [0.34, 0.28, 0.34],
          position: [0.14, 0.68, 0.06],
          material: feltMat("#89C682"),
          castShadow: true,
          receiveShadow: true
        })
      ],
      { position: [-4.15, 0, -2.55] }
    )
  );

  return {
    nodes,
    animated,
    replaceDefaultGround: true
  };
}

/**
 * Home Nook — honey-oak plank floor, woven terracotta & cream felt rug,
 * bevelled wainscoting & crown molding, arched sunlit garden window with
 * pleated felt curtains, real `lights.point` floor lamp + `lights.spot`
 * sunbeam, framed pastel reliefs, toy cubby shelf, and potted plant.
 */
export const homeNook: WorldDefinition = {
  id: "home-nook",
  workingTitle: "Home Nook",
  ground: { color: "#DCA974", size: 40 },
  musicBed: "homeBed",
  buildDiorama: buildHomeNookDiorama,
  dressing: [
    {
      kind: "primitive",
      shape: "cylinder",
      at: [3.45, 0.16, -1.95],
      size: [0.72, 0.32, 0.72],
      color: "#E8A690",
      materialStyle: "felt"
    },
    {
      kind: "model",
      key: "cushion",
      at: [3.45, 0.32, -1.95],
      yaw: -0.25,
      heightM: 0.22
    },
    {
      kind: "model",
      key: "table",
      at: [3.65, 0, -0.85],
      yaw: -0.35,
      heightM: 0.62
    },
    {
      kind: "model",
      key: "plate",
      at: [3.65, 0.62, -0.85],
      yaw: 0.2,
      heightM: 0.08
    },
    {
      kind: "model",
      key: "bush",
      at: [-4.15, 0.38, -2.55],
      heightM: 0.72
    }
  ]
};
