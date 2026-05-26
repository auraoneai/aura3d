export type AuthoredAssetRouteUse =
  | "water-lab"
  | "ocean-observatory"
  | "reactor-post"
  | "smart-city"
  | "data-galaxy"
  | "product-configurator"
  | "robotics-lab"
  | "physics-playground"
  | "fog-cathedral"
  | "digital-twin";

export type AuthoredAssetThreeReferenceCategory =
  | "glTF prop / environment detail"
  | "glTF material extension proof"
  | "glTF product / PBR material asset"
  | "glTF material variants"
  | "glTF interior / environment"
  | "glTF animation / skinning"
  | "glTF physics-scale prop"
  | "glTF showcase scene";

export type AuthoredAssetVisualRole =
  | "environment prop"
  | "material proof prop"
  | "hero product"
  | "material variant product"
  | "transparent product"
  | "interior environment"
  | "animated character"
  | "physics prop"
  | "showcase environment";

export type AuthoredAssetSourceKind =
  | "external-fixture"
  | "local-authored-fixture"
  | "generated-local-fixture"
  | "generated-derivative";

export interface AuthoredAssetProvenance {
  readonly sourceKind: AuthoredAssetSourceKind;
  readonly manifestPath?: string;
  readonly sourceScript?: string;
  readonly sourceAssetPath?: string;
  readonly generated: boolean;
  readonly derivative: boolean;
  readonly supportOnly: boolean;
  readonly acceptableAsFocalHero: boolean;
  readonly textureBacked?: boolean;
  readonly generatedNoTexture?: boolean;
  readonly semanticRoles?: readonly string[];
  readonly supportScaffoldRoles?: readonly string[];
  readonly defaultExcludedRoles?: readonly string[];
  readonly textureBackedFocalMaterials?: readonly string[];
}

export interface AuthoredAssetCandidate {
  readonly id: string;
  readonly title: string;
  readonly localUrl: string;
  readonly routeUse: AuthoredAssetRouteUse;
  readonly threeReferenceCategory: AuthoredAssetThreeReferenceCategory;
  readonly visualRole: AuthoredAssetVisualRole;
  readonly animated: boolean;
  readonly provenance?: AuthoredAssetProvenance;
  readonly knownLimitations: readonly string[];
  readonly acceptanceFocus: readonly string[];
}

export const AUTHORED_ASSET_CANDIDATES = [
  {
    id: "water-cinematic-marina-blender",
    title: "Authored Cinematic Marina Water Environment",
    localUrl: "/fixtures/advanced-gallery/assets/water-cinematic-marina-blender/water-cinematic-marina-blender.glb",
    routeUse: "water-lab",
    threeReferenceCategory: "glTF showcase scene",
    visualRole: "showcase environment",
    animated: false,
    knownLimitations: [
      "This is a local Blender-authored marina fixture, not a scanned film-quality environment pack.",
      "The interactive wave/ripple system remains A3D CPU/procedural geometry because a native GPGPU water solver is not exposed."
    ],
    acceptanceFocus: [
      "Foreground boardwalk, layered docks, boats, lanterns, reeds, rocks, pines, boathouses, and background hills are visible from the default camera.",
      "The runtime water surface and pointer ripples remain legible inside the authored marina basin.",
      "The route reads as a cinematic environment rather than a simple water plane."
    ]
  },
  {
    id: "marina-lake-scene",
    title: "Authored Marina Lake Scene",
    localUrl: "/fixtures/advanced-gallery/assets/marina-lake-scene/marina-lake-scene.gltf",
    routeUse: "water-lab",
    threeReferenceCategory: "glTF interior / environment",
    visualRole: "showcase environment",
    animated: false,
    knownLimitations: [
      "This authored fixture provides marina, shoreline, lodge, dock, and mountain composition; it is not a native GPGPU water solver.",
      "The water surface remains a procedural CPU ripple mesh and must stay documented as an approximation."
    ],
    acceptanceFocus: [
      "The water route uses authored environment geometry instead of mostly runtime shoreline primitives.",
      "The marina reads as a composed lake scene with foreground dock, midground boat/lodge, and background mountains.",
      "Pointer ripples and animated water remain visible against the authored environment."
    ]
  },
  {
    id: "marina-lake-blender",
    title: "Authored Blender Marina Lake",
    localUrl: "/fixtures/advanced-gallery/assets/marina-lake-blender/marina-lake-blender.glb",
    routeUse: "water-lab",
    threeReferenceCategory: "glTF interior / environment",
    visualRole: "showcase environment",
    animated: false,
    knownLimitations: [
      "This is a local Blender-authored replacement fixture, not a scanned/photoreal environment pack.",
      "The water route still uses A3D CPU/procedural ripple geometry because a native GPGPU water solver is not exposed."
    ],
    acceptanceFocus: [
      "Beveled/smoothed dock, boat, shoreline, trees, rocks, and lodge forms look less blocky than the earlier generated fixture.",
      "Water interaction remains visible in front of the authored environment.",
      "The scene still clearly documents CPU/procedural water rather than claiming native GPGPU water parity."
    ]
  },
  {
    id: "game-outpost",
    title: "Game Arena Outpost",
    localUrl: "/fixtures/advanced-gallery/assets/smart-city-district/smart-city-district.gltf",
    routeUse: "water-lab",
    threeReferenceCategory: "glTF interior / environment",
    visualRole: "showcase environment",
    animated: false,
    knownLimitations: [
      "This is authored environment set dressing, not a replacement for a native water/shoreline asset pack.",
      "It is used to improve scene context while the route remains honest about CPU water simulation."
    ],
    acceptanceFocus: [
      "Authored environment detail is visible around the water composition.",
      "The route still foregrounds interactive ripples and water motion.",
      "The scene does not rely on primitive shoreline blocks as the only environment detail."
    ]
  },
  {
    id: "civic-gallery-room",
    title: "Civic Gallery Room",
    localUrl: "/fixtures/advanced-gallery/assets/smart-city-district/smart-city-district.gltf",
    routeUse: "reactor-post",
    threeReferenceCategory: "glTF interior / environment",
    visualRole: "interior environment",
    animated: false,
    knownLimitations: [
      "Authored room structure provides staging depth, but not a true effects-composer pipeline.",
      "The reactor route still needs postprocess performance gates before acceptance."
    ],
    acceptanceFocus: [
      "The room creates foreground/midground/background structure behind the reactor.",
      "Lighting and effect props remain legible against authored architecture.",
      "Frame cadence remains visible in the runtime stats."
    ]
  },
  {
    id: "ocean-observatory-cinematic-blender",
    title: "Authored Cinematic Ocean Observatory",
    localUrl: "/fixtures/advanced-gallery/assets/ocean-observatory-cinematic-blender/ocean-observatory-cinematic-blender.glb",
    routeUse: "ocean-observatory",
    threeReferenceCategory: "glTF showcase scene",
    visualRole: "showcase environment",
    animated: false,
    knownLimitations: [
      "This is a local Blender-authored ocean/deck fixture, not a native WebGPU ocean renderer.",
      "The runtime ocean still uses WebGL2 procedural mesh waves until a production water shader/reflection stack exists."
    ],
    acceptanceFocus: [
      "Foreground caisson, raised deck, glass observatory, rails, masts, equipment modules, distant platform silhouettes, foam strokes, and beacon lights frame the ocean.",
      "The ocean route keeps layered wave motion, drone/object paths, and wind controls visible around the authored deck.",
      "The scene is visually distinct from the marina route."
    ]
  },
  {
    id: "ocean-observatory-deck",
    title: "Authored Ocean Observatory Deck",
    localUrl: "/fixtures/advanced-gallery/assets/ocean-observatory-deck/ocean-observatory-deck.gltf",
    routeUse: "ocean-observatory",
    threeReferenceCategory: "glTF interior / environment",
    visualRole: "showcase environment",
    animated: false,
    knownLimitations: [
      "This authored fixture provides deck, glass, rail, antenna, and observatory structure; it does not add native screen-space ocean reflection/refraction.",
      "The ocean surface remains a WebGL2 procedural mesh and must stay documented as an approximation."
    ],
    acceptanceFocus: [
      "The ocean route uses authored architectural staging instead of mostly runtime deck primitives.",
      "The observatory deck has foreground/midground detail that frames the animated ocean.",
      "The route still shows wind, drone paths, reflection streaks, and layered wave motion."
    ]
  },
  {
    id: "material-spheres",
    title: "Material Spheres Gallery",
    localUrl: "/fixtures/workflow-assets/assets/material-spheres/material-spheres.glb",
    routeUse: "reactor-post",
    threeReferenceCategory: "glTF material extension proof",
    visualRole: "material proof prop",
    animated: false,
    knownLimitations: [
      "Material spheres add detail and material variety, but do not prove complete extension parity.",
      "The route must remain candidate until a screenshot proves the material response is clear."
    ],
    acceptanceFocus: [
      "Multiple authored materials are visible under the reactor lights.",
      "The spheres read as a designed material wall rather than a hidden GLB count.",
      "The postprocess stack does not wash out material contrast."
    ]
  },
  {
    id: "product-camera",
    title: "Product Camera",
    localUrl: "/fixtures/workflow-assets/assets/product-camera/product-camera.glb",
    routeUse: "product-configurator",
    threeReferenceCategory: "glTF product / PBR material asset",
    visualRole: "hero product",
    animated: false,
    knownLimitations: [
      "Imported node/material controls still need real configurator wiring before visual acceptance.",
      "The asset is used as an authored product set member, not as proof of full e-commerce configurator parity."
    ],
    acceptanceFocus: [
      "Textured camera geometry is visible and framed as a premium product object.",
      "The product set contains multiple authored assets with distinct materials.",
      "Controls remain honest if they affect only route-level presentation."
    ]
  },
  {
    id: "variant-product",
    title: "Variant Product",
    localUrl: "/fixtures/workflow-assets/assets/variant-product/variant-product.glb",
    routeUse: "product-configurator",
    threeReferenceCategory: "glTF material variants",
    visualRole: "material variant product",
    animated: false,
    provenance: {
      sourceKind: "external-fixture",
      generated: false,
      derivative: false,
      supportOnly: false,
      acceptableAsFocalHero: true,
      textureBacked: true,
      generatedNoTexture: false
    },
    knownLimitations: [
      "Variant metadata is not yet wired to UI material switching in this gallery route.",
      "The asset improves authored product density but does not by itself satisfy material-variant interaction."
    ],
    acceptanceFocus: [
      "The imported product has distinct authored materials visible in the scene.",
      "The route labels material-variant interaction limits accurately.",
      "Camera presets can inspect the product without clipping."
    ]
  },
  {
    id: "toy-car",
    title: "Toy Car",
    localUrl: "/fixtures/threejs-parity/assets/vehicles/toy-car.glb",
    routeUse: "physics-playground",
    threeReferenceCategory: "glTF physics-scale prop",
    visualRole: "physics prop",
    animated: false,
    knownLimitations: [
      "This is a prop for simulation context, not a physics vehicle solver proof.",
      "Collision behavior is represented by primitive/proxy rigid bodies rather than mesh-derived vehicle collision."
    ],
    acceptanceFocus: [
      "Vehicle form reads clearly inside the manipulation testbed.",
      "The toy car reinforces physical scale and bins/conveyors.",
      "Runtime limitations are visible in the known-gaps panel."
    ]
  },
  {
    id: "compare-sheen",
    title: "Sheen Material Proof",
    localUrl: "/fixtures/threejs-parity/assets/materials/compare-sheen.glb",
    routeUse: "reactor-post",
    threeReferenceCategory: "glTF material extension proof",
    visualRole: "material proof prop",
    animated: false,
    knownLimitations: [
      "Material proof assets add authored material variety but are still supporting set dressing.",
      "The route must visually prove sheen response rather than only counting a loaded GLB."
    ],
    acceptanceFocus: [
      "Sheen material response is visible under reactor lighting.",
      "The asset adds material complexity without occluding the central effect.",
      "The route remains honest about unsupported composer features."
    ]
  },
  {
    id: "damaged-helmet",
    title: "Damaged Helmet",
    localUrl: "/fixtures/threejs-parity/assets/product/damaged-helmet.glb",
    routeUse: "reactor-post",
    threeReferenceCategory: "glTF prop / environment detail",
    visualRole: "environment prop",
    animated: false,
    knownLimitations: [
      "A high-quality prop can improve material/detail density but does not by itself make the reactor route a complete cinematic scene.",
      "Placement must not obscure the central reactor composition."
    ],
    acceptanceFocus: [
      "Helmet material detail and normal maps remain visible under reactor lighting.",
      "The prop reads as set dressing rather than the whole demo.",
      "Frame time remains acceptable after adding the authored prop."
    ]
  },
  {
    id: "compare-clearcoat",
    title: "Clearcoat Material Proof",
    localUrl: "/fixtures/threejs-parity/assets/materials/compare-clearcoat.glb",
    routeUse: "reactor-post",
    threeReferenceCategory: "glTF material extension proof",
    visualRole: "material proof prop",
    animated: false,
    knownLimitations: [
      "Material-extension proof assets are diagnostic props, not full scenes.",
      "Acceptance depends on whether clearcoat response is visible in the composed scene."
    ],
    acceptanceFocus: [
      "Clearcoat material differences are visible.",
      "The asset adds meaningful material variety to the route.",
      "The route labels material-extension support without overstating parity."
    ]
  },
  {
    id: "compare-transmission",
    title: "Transmission Material Proof",
    localUrl: "/fixtures/threejs-parity/assets/materials/compare-transmission.glb",
    routeUse: "ocean-observatory",
    threeReferenceCategory: "glTF material extension proof",
    visualRole: "material proof prop",
    animated: false,
    knownLimitations: [
      "Transmission is renderer-bounded and must be visually verified; the asset is only supporting detail.",
      "This does not replace a true water/refraction pipeline."
    ],
    acceptanceFocus: [
      "Transparent or transmissive surfaces remain legible.",
      "The prop supports the observatory/deck story rather than reading as a diagnostic sample.",
      "The route clearly documents water/refraction gaps."
    ]
  },
  {
    id: "glass-broken-window",
    title: "Khronos Glass Broken Window",
    localUrl: "/fixtures/advanced-gallery/assets/khronos-showcase/glass-broken-window.glb",
    routeUse: "reactor-post",
    threeReferenceCategory: "glTF material extension proof",
    visualRole: "transparent product",
    animated: false,
    knownLimitations: [
      "Used as an authored glass/transparency stress prop for the command-center scene, not as proof of complete screen-space refraction.",
      "Acceptance depends on screenshot review proving that transparent layers add depth without washing out the reactor composition."
    ],
    acceptanceFocus: [
      "Broken glass silhouettes and transparency are visible in the postprocess scene.",
      "The asset adds foreground/midground depth instead of reading as a hidden asset count.",
      "Material contrast remains readable after color grading."
    ]
  },
  {
    id: "glass-vase-flowers",
    title: "Khronos Glass Vase Flowers",
    localUrl: "/fixtures/advanced-gallery/assets/khronos-showcase/glass-vase-flowers.glb",
    routeUse: "reactor-post",
    threeReferenceCategory: "glTF material extension proof",
    visualRole: "transparent product",
    animated: false,
    knownLimitations: [
      "Glass and thin-detail rendering must be verified in-route; this asset is a visual-quality candidate, not automatic parity evidence.",
      "Small authored detail can disappear if camera framing or postprocess contrast is wrong."
    ],
    acceptanceFocus: [
      "The vase glass and flower geometry are legible in the route screenshot.",
      "The object adds organic material contrast against the reactor hardware.",
      "No default white/fallback material dominates the asset."
    ]
  },
  {
    id: "glam-velvet-sofa",
    title: "Khronos Glam Velvet Sofa",
    localUrl: "/fixtures/advanced-gallery/assets/khronos-showcase/glam-velvet-sofa.glb",
    routeUse: "reactor-post",
    threeReferenceCategory: "glTF product / PBR material asset",
    visualRole: "hero product",
    animated: false,
    knownLimitations: [
      "Fabric/sheen readability depends on lighting and material support; it must be judged by screenshot, not asset presence.",
      "The sofa is supporting set dressing for the command-center composition rather than the core postprocess feature."
    ],
    acceptanceFocus: [
      "Velvet/fabric material response is visible under the route lighting.",
      "The sofa gives the scene a real interior scale cue.",
      "It does not occlude the reactor, holographic panels, or authored room shell."
    ]
  },
  {
    id: "digital-twin-factory-blender",
    title: "Authored Robotics Factory Digital Twin",
    localUrl: "/fixtures/advanced-gallery/assets/digital-twin-factory-blender/digital-twin-factory-blender.glb",
    routeUse: "digital-twin",
    threeReferenceCategory: "glTF showcase scene",
    visualRole: "showcase environment",
    animated: false,
    knownLimitations: [
      "This is a local Blender-authored factory fixture, not a CAD import pipeline or live robot telemetry feed.",
      "Robot, package, heatmap, and sensor motion are still driven by the route's deterministic runtime systems.",
      "The asset improves industrial composition but does not by itself prove full Three.js-class digital-twin parity."
    ],
    acceptanceFocus: [
      "Factory layout, conveyors, workcells, racks, robot arms, mobile robots, sensor cones, heatmap plates, and operator stations dominate the screenshot.",
      "The flagship route no longer depends on a stylized city asset as its primary authored environment.",
      "Runtime overlays and motion read as factory simulation data rather than decorative generic UI."
    ]
  },
  {
    id: "commercial-refrigerator",
    title: "Khronos Commercial Refrigerator",
    localUrl: "/fixtures/advanced-gallery/assets/khronos-showcase/commercial-refrigerator.glb",
    routeUse: "digital-twin",
    threeReferenceCategory: "glTF product / PBR material asset",
    visualRole: "hero product",
    animated: false,
    knownLimitations: [
      "Used as an industrial equipment proxy inside the digital-twin scene, not as a full CAD import pipeline.",
      "Large texture upload time and material fidelity must be measured before acceptance."
    ],
    acceptanceFocus: [
      "Industrial equipment shape, shelves, doors, and material detail are recognizable.",
      "The asset fits the factory/digital-twin scale without hiding robot/sensor overlays.",
      "Load time and frame cadence remain within the candidate route budget."
    ]
  },
  {
    id: "reactor-command-center-blender",
    title: "Authored Reactor Command Center",
    localUrl: "/fixtures/advanced-gallery/assets/reactor-command-center-blender/reactor-command-center-blender.glb",
    routeUse: "reactor-post",
    threeReferenceCategory: "glTF showcase scene",
    visualRole: "showcase environment",
    animated: false,
    knownLimitations: [
      "This is a local Blender-authored command-center fixture, not a scanned film-quality set.",
      "Bloom, depth of field, and volumetric effects remain bounded renderer approximations until the postprocess stack is optimized and visually accepted."
    ],
    acceptanceFocus: [
      "The reactor route has a coherent command-center environment before post effects are judged.",
      "Central plasma core, containment rings, balconies, telemetry panels, pylons, and foreground/background layers remain visible from the default camera.",
      "Procedural postprocess proof elements support the authored scene instead of dominating it as debug geometry."
    ]
  },
  {
    id: "product-configurator-studio-blender",
    title: "Authored Premium Product Configurator Studio",
    localUrl: "/fixtures/advanced-gallery/assets/product-configurator-studio-blender/product-configurator-studio-blender.glb",
    routeUse: "product-configurator",
    threeReferenceCategory: "glTF showcase scene",
    visualRole: "showcase environment",
    animated: false,
    provenance: {
      sourceKind: "generated-local-fixture",
      manifestPath: "fixtures/advanced-gallery/assets/product-configurator-studio-blender/manifest.json",
      sourceScript: "tools/advanced-gallery-assets/generate-product-configurator-studio-blender.py",
      generated: true,
      derivative: false,
      supportOnly: true,
      acceptableAsFocalHero: false,
      textureBacked: false,
      generatedNoTexture: true
    },
    knownLimitations: [
      "This is a local Blender-authored product studio fixture, not a photographed commercial product asset.",
      "The GLB contains named product/studio components and hotspot metadata, but imported-node hotspot selection and true node-level exploded animation are still route work."
    ],
    acceptanceFocus: [
      "The route foregrounds one assembled multi-part premium product in a studio, not a shelf of unrelated props.",
      "Plinth, lighting rigs, swatches, UI panels, hotspot markers, product parts, glass, metal, rubber, and emissive details are visible.",
      "Watch and shoe material-variant assets remain available as supporting controls without dominating the hero composition."
    ]
  },
  {
    id: "car-concept",
    title: "Car Concept",
    localUrl: "/fixtures/threejs-parity/assets/vehicles/car-concept.glb",
    routeUse: "product-configurator",
    threeReferenceCategory: "glTF product / PBR material asset",
    visualRole: "hero product",
    animated: false,
    provenance: {
      sourceKind: "external-fixture",
      generated: false,
      derivative: false,
      supportOnly: false,
      acceptableAsFocalHero: true,
      textureBacked: true,
      generatedNoTexture: false
    },
    knownLimitations: [
      "The product route now prioritizes this original texture-backed concept-car asset as the hero rather than the batched derivative.",
      "Needs imported-asset framing, inspection lighting, and controls before it can be accepted as a finished configurator.",
      "May not expose enough named subparts for a full exploded configurator pass without loader-side node inspection."
    ],
    acceptanceFocus: [
      "Asset loads from the local fixture path.",
      "Vehicle silhouette, paint, glass, and wheel materials are visible under gallery lighting.",
      "Camera presets frame both full-car and detail views without clipping."
    ]
  },
  {
    id: "car-concept-batched",
    title: "Car Concept Batched",
    localUrl: "/fixtures/advanced-gallery/assets/product-configurator-car-batched/car-concept-batched.glb",
    routeUse: "product-configurator",
    threeReferenceCategory: "glTF product / PBR material asset",
    visualRole: "hero product",
    animated: false,
    provenance: {
      sourceKind: "generated-derivative",
      manifestPath: "fixtures/advanced-gallery/assets/product-configurator-car-batched/manifest.json",
      sourceScript: "tools/advanced-gallery-assets/optimize-product-car-blender.py",
      sourceAssetPath: "fixtures/threejs-parity/assets/vehicles/car-concept.glb",
      generated: true,
      derivative: true,
      supportOnly: true,
      acceptableAsFocalHero: false,
      textureBacked: true,
      generatedNoTexture: false
    },
    knownLimitations: [
      "This is a local Blender optimization of the original concept-car GLB, not a new premium commercial vehicle model.",
      "Batching reduces draw submissions but does not add true node-level configurator semantics or exploded-part behavior by itself.",
      "The optimized export preserves the concept-car silhouette and primary material families, but still requires screenshot review before acceptance."
    ],
    acceptanceFocus: [
      "Vehicle silhouette, paint, glass, wheels, and interior remain visible after batching.",
      "Draw-item count drops significantly versus the original unbatched car asset.",
      "The product route remains honest about missing imported-node hotspots and true exploded configurator behavior."
    ]
  },
  {
    id: "chronograph-watch",
    title: "Chronograph Watch",
    localUrl: "/fixtures/threejs-parity/assets/product/chronograph-watch.glb",
    routeUse: "product-configurator",
    threeReferenceCategory: "glTF product / PBR material asset",
    visualRole: "hero product",
    animated: false,
    provenance: {
      sourceKind: "external-fixture",
      generated: false,
      derivative: false,
      supportOnly: false,
      acceptableAsFocalHero: true,
      textureBacked: true,
      generatedNoTexture: false
    },
    knownLimitations: [
      "Small product scale needs verified camera bounds and near-plane handling.",
      "Configurator controls must be based on real imported nodes or clearly presented as inspection controls."
    ],
    acceptanceFocus: [
      "Dial, case, strap, and reflective details remain legible.",
      "Studio lighting shows metallic and roughness differences.",
      "Detail camera can inspect the face without losing the surrounding case."
    ]
  },
  {
    id: "materials-variants-shoe",
    title: "Materials Variants Shoe",
    localUrl: "/fixtures/threejs-parity/assets/product/materials-variants-shoe.glb",
    routeUse: "product-configurator",
    threeReferenceCategory: "glTF material variants",
    visualRole: "material variant product",
    animated: false,
    provenance: {
      sourceKind: "external-fixture",
      generated: false,
      derivative: false,
      supportOnly: false,
      acceptableAsFocalHero: true,
      textureBacked: true,
      generatedNoTexture: false
    },
    knownLimitations: [
      "Material variant switching depends on the importer exposing variant metadata to the gallery route.",
      "Fallback rendering must not imply variants are interactive if the route only displays the default material."
    ],
    acceptanceFocus: [
      "Shoe loads with authored geometry and default material intact.",
      "Variant metadata, if exposed, is surfaced as explicit selectable options.",
      "Product remains centered and grounded through default and variant states."
    ]
  },
  {
    id: "sunglasses-khronos",
    title: "Sunglasses Khronos",
    localUrl: "/fixtures/threejs-parity/assets/product/sunglasses-khronos.glb",
    routeUse: "product-configurator",
    threeReferenceCategory: "glTF product / PBR material asset",
    visualRole: "transparent product",
    animated: false,
    provenance: {
      sourceKind: "external-fixture",
      generated: false,
      derivative: false,
      supportOnly: false,
      acceptableAsFocalHero: true,
      textureBacked: true,
      generatedNoTexture: false
    },
    knownLimitations: [
      "Transparent lenses need renderer verification for sorting, tint, and reflections.",
      "Thin geometry may require careful camera padding to avoid reading as flat."
    ],
    acceptanceFocus: [
      "Lens transparency and frame material are visibly distinct.",
      "Temples, bridge, and lens curvature read at gallery distance.",
      "Turntable or orbit motion does not introduce transparency artifacts."
    ]
  },
  {
    id: "khronos-sponza",
    title: "Khronos Sponza Atrium",
    localUrl: "/fixtures/advanced-gallery/assets/khronos-showcase/sponza-packed/sponza-packed.glb",
    routeUse: "fog-cathedral",
    threeReferenceCategory: "glTF showcase scene",
    visualRole: "showcase environment",
    animated: false,
    knownLimitations: [
      "This is an official Khronos glTF Sample Assets environment packed locally into a single GLB; it is not generated by A3D.",
      "It improves authored architectural detail, but A3D still lacks a production volumetric raymarch/god-ray pass for this route.",
      "The asset is texture-heavy, so load time and frame cadence must be measured before any visual acceptance claim."
    ],
    acceptanceFocus: [
      "The Sponza atrium's textured columns, arches, drapes, and floor detail dominate the fog route screenshot.",
      "A3D loads external glTF buffers and many texture references without fallback-white materials.",
      "Atmospheric fog/light-shaft approximations support the authored architecture rather than hiding it."
    ]
  },
  {
    id: "sponza-cathedral-crop",
    title: "Curated Khronos Sponza Interior Crop",
    localUrl: "/fixtures/advanced-gallery/assets/khronos-showcase/sponza-cathedral-crop/sponza-cathedral-crop.glb",
    routeUse: "fog-cathedral",
    threeReferenceCategory: "glTF showcase scene",
    visualRole: "showcase environment",
    animated: false,
    knownLimitations: [
      "This is a curated local crop of the official Khronos Sponza asset with added A3D fog/light-shaft staging; it is not a native volumetric renderer.",
      "Texture payload and draw-call cost must stay visible in the route report before it can be considered for acceptance.",
      "The route still approximates god rays with transparent geometry cards because A3D does not expose a production volumetric raymarch pass."
    ],
    acceptanceFocus: [
      "The route screenshot frames a textured architectural interior rather than the exterior roof block.",
      "Columns, drapes, floor texture, haze, lanterns, and light shafts are all visible from the default camera.",
      "Load time is materially better than the full Sponza candidate or is explicitly rejected."
    ]
  },
  {
    id: "fog-cathedral-blender",
    title: "Authored Fog Cathedral Environment",
    localUrl: "/fixtures/advanced-gallery/assets/fog-cathedral-blender/fog-cathedral-blender.glb",
    routeUse: "fog-cathedral",
    threeReferenceCategory: "glTF interior / environment",
    visualRole: "showcase environment",
    animated: false,
    knownLimitations: [
      "This is a local Blender-authored atmospheric environment fixture, not a scanned cathedral or a true volumetric renderer.",
      "Light shafts and fog cards remain geometry/material approximations until A3D exposes a production volumetric pass."
    ],
    acceptanceFocus: [
      "The route reads as a composed nave/apse environment rather than repeated primitive pillars.",
      "Foreground, midground, and background architectural layers remain visible through the fog.",
      "Emissive stained glass, floor inlays, lanterns, and reliquary details create a cinematic lighting hierarchy."
    ]
  },
  {
    id: "antique-camera-interior",
    title: "Antique Camera Interior",
    localUrl: "/fixtures/threejs-parity/assets/architecture/antique-camera-interior.glb",
    routeUse: "fog-cathedral",
    threeReferenceCategory: "glTF interior / environment",
    visualRole: "interior environment",
    animated: false,
    knownLimitations: [
      "Dense interior detail needs verified load time and draw-call budget before use in the advanced gallery.",
      "The route needs environment-aware camera presets instead of product-style framing."
    ],
    acceptanceFocus: [
      "Interior depth and large authored structure are immediately readable.",
      "Lighting and fog enhance depth without hiding authored details.",
      "Navigation frames both overview and close interior inspection shots."
    ]
  },
  {
    id: "lantern-interior",
    title: "Lantern Interior",
    localUrl: "/fixtures/threejs-parity/assets/architecture/lantern-interior.glb",
    routeUse: "fog-cathedral",
    threeReferenceCategory: "glTF interior / environment",
    visualRole: "interior environment",
    animated: false,
    knownLimitations: [
      "Emissive and translucent material handling must be verified against the renderer path used by the gallery.",
      "Interior scale may require custom camera bounds rather than generic imported-asset defaults."
    ],
    acceptanceFocus: [
      "Lantern structure, interior enclosure, and emissive details are visible.",
      "Fog or bloom settings do not wash out authored material contrast.",
      "Scene reads as an authored environment rather than a single prop."
    ]
  },
  {
    id: "robot-expressive",
    title: "Robot Expressive",
    localUrl: "/fixtures/threejs-parity/assets/character/robot-expressive.glb",
    routeUse: "robotics-lab",
    threeReferenceCategory: "glTF animation / skinning",
    visualRole: "animated character",
    animated: true,
    knownLimitations: [
      "Requires animation clip discovery and playback controls before replacing procedural robot animation.",
      "Morph targets and facial expression support must be verified in the active A3D importer."
    ],
    acceptanceFocus: [
      "At least one authored animation clip plays in the gallery route.",
      "Skinning, morph targets, or expression changes remain stable across frames.",
      "Timeline controls reflect real clip state instead of procedural placeholders."
    ]
  },
  {
    id: "soldier",
    title: "Soldier",
    localUrl: "/fixtures/threejs-parity/assets/character/soldier.glb",
    routeUse: "robotics-lab",
    threeReferenceCategory: "glTF animation / skinning",
    visualRole: "animated character",
    animated: true,
    knownLimitations: [
      "Needs clip selection and skeleton playback verification in the gallery renderer.",
      "Character scale and ground contact must be tuned for the robotics lab composition."
    ],
    acceptanceFocus: [
      "Skinned mesh deforms correctly while animation plays.",
      "Looping motion remains grounded and visible from the default camera.",
      "Playback, pause, and scrub controls map to actual animation time."
    ]
  },
  {
    id: "xbot",
    title: "XBot",
    localUrl: "/fixtures/threejs-parity/assets/character/xbot.glb",
    routeUse: "robotics-lab",
    threeReferenceCategory: "glTF animation / skinning",
    visualRole: "animated character",
    animated: true,
    knownLimitations: [
      "Needs verified skeletal animation playback before use as an advanced-gallery candidate.",
      "Default materials may need route lighting tuned to avoid a flat mannequin look."
    ],
    acceptanceFocus: [
      "Rigged character renders with correct pose and proportions.",
      "Animation controls produce visible authored skeletal motion.",
      "Lab context frames the character as a real imported asset, not a procedural stand-in."
    ]
  },
  {
    id: "physics-robotics-testbed-blender",
    title: "Authored Robotics Physics Testbed",
    localUrl: "/fixtures/advanced-gallery/assets/physics-robotics-testbed-blender/physics-robotics-testbed-blender.glb",
    routeUse: "physics-playground",
    threeReferenceCategory: "glTF showcase scene",
    visualRole: "showcase environment",
    animated: false,
    knownLimitations: [
      "This is a static authored robotics manipulation fixture; runtime contacts are driven by route-level primitive/proxy rigid bodies.",
      "The fixture provides conveyors, bins, ramps, grippers, sensors, target zones, and debug overlays as visual context, not articulated robot dynamics."
    ],
    acceptanceFocus: [
      "The route reads as a robotics manipulation testbed rather than a generic block pile.",
      "Runtime moving rigid-body objects remain visible around the authored conveyors, bins, ramps, and robot tooling.",
      "Known-gaps copy makes clear that mesh colliders and full articulated robot dynamics are not connected in this app route."
    ]
  },
  {
    id: "cesium-milk-truck",
    title: "Cesium Milk Truck",
    localUrl: "/fixtures/threejs-parity/assets/physics/cesium-milk-truck.glb",
    routeUse: "physics-playground",
    threeReferenceCategory: "glTF physics-scale prop",
    visualRole: "physics prop",
    animated: false,
    knownLimitations: [
      "Physics route integration must use explicit proxy colliders if mesh colliders are not available.",
      "Acceptance should focus on authored asset placement and interaction readiness, not on full vehicle simulation."
    ],
    acceptanceFocus: [
      "Truck loads with recognizable body, wheels, and cargo silhouette.",
      "Physics playground can place and frame the asset at believable scale.",
      "Collider or proxy bounds visibly match the authored model closely enough for interaction tests."
    ]
  },
  {
    id: "duck",
    title: "Duck",
    localUrl: "/fixtures/threejs-parity/assets/physics/duck.glb",
    routeUse: "physics-playground",
    threeReferenceCategory: "glTF physics-scale prop",
    visualRole: "physics prop",
    animated: false,
    knownLimitations: [
      "Simple prop geometry should not be overrepresented as a flagship authored scene.",
      "Physics tests need visible proxy state if the route cannot derive precise collision geometry."
    ],
    acceptanceFocus: [
      "Duck loads quickly from the local fixture path.",
      "Scale, bounds, and material color remain recognizable in the physics scene.",
      "Interaction or placement behavior is easy to inspect from the default camera."
    ]
  },
  {
    id: "smart-city-district",
    title: "Authored Smart City District",
    localUrl: "/fixtures/advanced-gallery/assets/smart-city-district/smart-city-district.gltf",
    routeUse: "smart-city",
    threeReferenceCategory: "glTF showcase scene",
    visualRole: "showcase environment",
    animated: false,
    knownLimitations: [
      "This is a locally authored showcase fixture generated for the gallery, not an external photoreal city scan.",
      "It proves A3D can load and compose a dense batched city GLTF quickly, while route-level data pulses and traffic supply runtime motion."
    ],
    acceptanceFocus: [
      "City district loads in seconds rather than tens of seconds.",
      "Authored roads, windows, towers, trees, beacons, and district materials dominate the composition.",
      "Procedural instancing remains a supporting data overlay instead of hiding the authored scene."
    ]
  },
  {
    id: "littlest-tokyo",
    title: "Littlest Tokyo",
    localUrl: "/fixtures/threejs-parity/assets/showcase/littlest-tokyo.glb",
    routeUse: "smart-city",
    threeReferenceCategory: "glTF showcase scene",
    visualRole: "showcase environment",
    animated: true,
    knownLimitations: [
      "This is an official-style authored animated showcase fixture, but it still needs A3D load-time, animation, material, and camera-bound verification before acceptance.",
      "The route must remain candidate until screenshots prove the authored city reads better than the generated local district and frame cadence stays usable."
    ],
    acceptanceFocus: [
      "City scene loads with recognizable authored density, props, rails, buildings, signage, and depth.",
      "Embedded keyframe animation plays without corrupting transforms or materials.",
      "The smart-city route frames the authored scene as the main subject while retaining A3D traffic/data overlays as supporting systems."
    ]
  },
  {
    id: "data-galaxy-core-blender",
    title: "Authored AI Data Galaxy Core",
    localUrl: "/fixtures/advanced-gallery/assets/data-galaxy-core-blender/data-galaxy-core-blender.glb",
    routeUse: "data-galaxy",
    threeReferenceCategory: "glTF showcase scene",
    visualRole: "environment prop",
    animated: false,
    provenance: {
      sourceKind: "generated-local-fixture",
      manifestPath: "fixtures/advanced-gallery/assets/data-galaxy-core-blender/manifest.json",
      sourceScript: "tools/advanced-gallery-assets/generate-data-galaxy-core-blender.py",
      generated: true,
      derivative: false,
      supportOnly: true,
      acceptableAsFocalHero: false,
      textureBacked: true,
      generatedNoTexture: false,
      semanticRoles: [
        "focal-core",
        "semantic-cluster",
        "signal-bead"
      ],
      supportScaffoldRoles: [],
      defaultExcludedRoles: [
        "focal-core",
        "formation-control",
        "connection-loom",
        "analytics-panel",
        "decorative-pylon",
        "support-platform",
        "floor-trace",
        "debug-axis",
        "support-scaffold"
      ],
      textureBackedFocalMaterials: [
        "cyan neural emission",
        "violet model-state emission",
        "amber anomaly emission"
      ]
    },
    knownLimitations: [
      "This is a static authored GLB fixture for the AI data-galaxy composition with embedded generated data-glyph textures on key materials; it remains support-only and does not add native GPU particle compute.",
      "Default showcase excludes the generated focal/scaffold roles so the route-owned particle/data-core system carries the hero image; the GLB remains tiny support/provenance evidence."
    ],
    acceptanceFocus: [
      "Generated semantic clusters and signal beads may support the data route, but generated focal-core rings/bars/scaffold roles cannot dominate the default hero.",
      "The particle/data-core system remains the default focal subject while the generated support GLB stays disclosed.",
      "The route continues to document CPU particle limits rather than claiming GPGPU particle parity."
    ]
  },
  {
    id: "animated-morph-cube",
    title: "Animated Morph Core",
    localUrl: "/fixtures/threejs-parity/assets/animation/animated-morph-cube.glb",
    routeUse: "data-galaxy",
    threeReferenceCategory: "glTF animation / skinning",
    visualRole: "environment prop",
    animated: true,
    knownLimitations: [
      "This is an authored animation core, not a substitute for GPU particle simulation.",
      "The data-galaxy route must still be judged by dense particles and formation controls."
    ],
    acceptanceFocus: [
      "Morph animation plays visibly as the central data core.",
      "The particle field remains the primary visual system.",
      "The route documents CPU particle limits honestly."
    ]
  },
  {
    id: "animated-colors-cube",
    title: "Animated Color Satellite",
    localUrl: "/fixtures/threejs-parity/assets/animation/animated-colors-cube.glb",
    routeUse: "data-galaxy",
    threeReferenceCategory: "glTF animation / skinning",
    visualRole: "environment prop",
    animated: true,
    knownLimitations: [
      "This is supporting animated authored geometry and should not be presented as a particle engine by itself."
    ],
    acceptanceFocus: [
      "Color animation is visible beside the particle system.",
      "The asset contributes to the multi-system composition.",
      "The route remains visually particle-led."
    ]
  },
  {
    id: "box-animated",
    title: "Animated Signal Module",
    localUrl: "/fixtures/threejs-parity/assets/animation/box-animated.glb",
    routeUse: "data-galaxy",
    threeReferenceCategory: "glTF animation / skinning",
    visualRole: "environment prop",
    animated: true,
    knownLimitations: [
      "Simple authored animation module only; accepted visuals require the complete composed particle scene."
    ],
    acceptanceFocus: [
      "Animation is visible and synchronized with the data-galaxy scene.",
      "The module reads as part of the AI visualization rather than a standalone cube demo."
    ]
  },
  {
    id: "robotics-training-factory-blender",
    title: "Authored Robotics Training Factory",
    localUrl: "/fixtures/advanced-gallery/assets/robotics-training-lab-blender/robotics-training-lab-blender.glb",
    routeUse: "robotics-lab",
    threeReferenceCategory: "glTF showcase scene",
    visualRole: "showcase environment",
    animated: false,
    knownLimitations: [
      "This is authored lab set dressing, not proof of full physics or robot telemetry.",
      "Animated characters still come from the Soldier, Robot Expressive, and XBot GLBs."
    ],
    acceptanceFocus: [
      "The robotics lab has industrial context behind the animated characters.",
      "Imported animated characters remain the visual subject instead of procedural crates or debug geometry.",
      "The route keeps animation diagnostics and motion gates active."
    ]
  },
  {
    id: "kira-ik-room",
    title: "Kira IK Room",
    localUrl: "/fixtures/threejs-parity/assets/showcase/kira-ik-room.glb",
    routeUse: "robotics-lab",
    threeReferenceCategory: "glTF showcase scene",
    visualRole: "showcase environment",
    animated: false,
    knownLimitations: [
      "The local Kira fixture contains a skinned character and room content but no animation clips, so it cannot be accepted as an animated-character demo.",
      "IK-specific behavior needs route-level support and should not be implied by static glTF loading.",
      "Room plus character composition requires custom camera bounds, material validation, and load-time diagnostics."
    ],
    acceptanceFocus: [
      "Authored room and character content load from the local showcase fixture.",
      "The route reports zero animation clips honestly instead of presenting the room as animated IK content.",
      "Robotics-lab framing shows both the character context and the surrounding room."
    ]
  }
] as const satisfies readonly AuthoredAssetCandidate[];

export type AuthoredAssetCandidateId = typeof AUTHORED_ASSET_CANDIDATES[number]["id"];
export type AuthoredAssetCandidateRecord = AuthoredAssetCandidate & { readonly id: AuthoredAssetCandidateId };

const AUTHORED_ASSET_CANDIDATES_BY_ID: ReadonlyMap<AuthoredAssetCandidateId, AuthoredAssetCandidateRecord> = new Map(
  AUTHORED_ASSET_CANDIDATES.map((candidate) => [candidate.id, candidate])
);

export function getAuthoredAssetCandidate(id: AuthoredAssetCandidateId): AuthoredAssetCandidateRecord {
  const candidate = AUTHORED_ASSET_CANDIDATES_BY_ID.get(id);
  if (!candidate) {
    throw new Error(`Unknown authored asset candidate: ${id}`);
  }
  return candidate;
}

export function findAuthoredAssetCandidate(id: string): AuthoredAssetCandidateRecord | undefined {
  return AUTHORED_ASSET_CANDIDATES_BY_ID.get(id as AuthoredAssetCandidateId);
}

export function getAuthoredAssetCandidatesForRoute(routeUse: AuthoredAssetRouteUse): readonly AuthoredAssetCandidate[] {
  return AUTHORED_ASSET_CANDIDATES.filter((candidate) => candidate.routeUse === routeUse);
}

export function getAuthoredAssetCandidatesByReferenceCategory(
  threeReferenceCategory: AuthoredAssetThreeReferenceCategory
): readonly AuthoredAssetCandidate[] {
  return AUTHORED_ASSET_CANDIDATES.filter((candidate) => candidate.threeReferenceCategory === threeReferenceCategory);
}

export function getAnimatedAuthoredAssetCandidates(): readonly AuthoredAssetCandidate[] {
  return AUTHORED_ASSET_CANDIDATES.filter((candidate) => candidate.animated);
}
