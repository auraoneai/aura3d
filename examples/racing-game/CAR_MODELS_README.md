# Racing Game - 3D Car Models & Textures

This document describes the new procedural car model system for the G3D Racing Game.

## Overview

The racing game now features detailed procedural 3D car models with realistic materials and textures, replacing the previous simple box placeholders.

## New Components

### 1. ProceduralCarBuilder (`src/ProceduralCarBuilder.ts`)

A comprehensive car model generator that creates realistic-looking racing cars with:

#### Car Components
- **Body Sections**: Main body, hood, rear/trunk sections with proper proportions
- **Cabin/Greenhouse**: Windshield and window area with tinted glass material
- **Wheels**: 4 detailed wheels with separate tire (rubber) and rim (chrome) meshes
- **Spoiler**: Adjustable rear spoiler for downforce
- **Details**: Bumpers, side mirrors, headlights with emission

#### Car Styles
Four pre-defined car styles with different proportions:

1. **Sports Car** (`CAR_STYLES.sports`)
   - Length: 4.5m, Width: 2.0m, Height: 1.3m
   - Low profile, balanced proportions
   - Moderate spoiler height

2. **Muscle Car** (`CAR_STYLES.muscle`)
   - Length: 5.0m, Width: 2.2m, Height: 1.4m
   - Longer hood, wider stance
   - Small spoiler

3. **Supercar** (`CAR_STYLES.supercar`)
   - Length: 4.8m, Width: 2.1m, Height: 1.2m
   - Very low profile, aggressive stance
   - Large rear spoiler

4. **Rally Car** (`CAR_STYLES.rally`)
   - Length: 4.2m, Width: 1.9m, Height: 1.5m
   - Higher ground clearance
   - Large rally spoiler

#### Usage Example

```typescript
import { ProceduralCarBuilder } from './ProceduralCarBuilder';
import { Color } from 'g3d';

// Create a blue supercar
const playerCar = ProceduralCarBuilder.createSupercar(
  'PlayerVehicle',
  new Color(0.1, 0.4, 1.0)
);
scene.add(playerCar);

// Create a red sports car
const aiCar = ProceduralCarBuilder.createSportsCar(
  'AIVehicle0',
  new Color(1.0, 0.15, 0.15)
);
scene.add(aiCar);
```

### 2. ProceduralTextureGenerator (`src/ProceduralTextureGenerator.ts`)

Generates procedural textures for car materials:

#### Available Textures

- **Metallic Car Paint**: Realistic car paint with metallic flakes and subtle color variation
- **Carbon Fiber**: Woven carbon fiber pattern for performance parts
- **Racing Stripes**: Classic dual racing stripes
- **Normal Maps**: Surface detail for paint and materials
- **Roughness Maps**: Glossiness variation across surfaces
- **Number Decals**: Car racing numbers with outlines
- **Tire Tread**: Rubber tread patterns
- **Chrome Rims**: Metallic wheel rim textures

#### Paint Presets

Pre-configured car paint colors:

```typescript
import { CarPaintPresets } from './ProceduralTextureGenerator';

// Available presets:
const redPaint = CarPaintPresets.createGlossyRed();
const bluePaint = CarPaintPresets.createMetallicBlue();
const silverPaint = CarPaintPresets.createMetallicSilver();
const blackPaint = CarPaintPresets.createMatteBlack();
const yellowPaint = CarPaintPresets.createRacingYellow();
const orangePaint = CarPaintPresets.createVividOrange();
const purplePaint = CarPaintPresets.createDeepPurple();
const tealPaint = CarPaintPresets.createElectricTeal();
```

#### Custom Texture Generation

```typescript
import { ProceduralTextureGenerator } from './ProceduralTextureGenerator';

// Custom metallic paint
const customPaint = ProceduralTextureGenerator.createMetallicPaint({
  width: 512,
  height: 512,
  baseColor: new Color(0.9, 0.1, 0.1),
  variation: 0.05
});

// Create normal map for surface detail
const normalMap = ProceduralTextureGenerator.createPaintNormalMap({
  width: 512,
  height: 512
});

// Create roughness variation map
const roughnessMap = ProceduralTextureGenerator.createRoughnessMap({
  variation: 0.25  // Base roughness
});
```

## Materials & PBR Properties

All car components use physically-based rendering (PBR) materials:

### Body Paint
- **Albedo**: Base car color
- **Metallic**: 0.6 (moderate metallic for car paint)
- **Roughness**: 0.25 (glossy finish)

### Glass/Windows
- **Albedo**: Dark tinted (0.15, 0.20, 0.25, 0.8)
- **Metallic**: 0.3
- **Roughness**: 0.05 (very smooth glass)

### Tires
- **Albedo**: Very dark (0.08, 0.08, 0.08)
- **Metallic**: 0.0 (rubber is non-metallic)
- **Roughness**: 0.95 (very rough rubber)

### Chrome Rims
- **Albedo**: Light grey (0.7, 0.7, 0.75)
- **Metallic**: 0.9 (highly metallic)
- **Roughness**: 0.15 (shiny chrome)

### Headlights
- **Albedo**: White (0.95, 0.95, 1.0)
- **Emission**: White glow
- **Emission Intensity**: 0.5
- **Metallic**: 0.8
- **Roughness**: 0.1 (very smooth)

## Current Implementation

The racing game (`main.ts`) now creates the following vehicles:

### Player Vehicle
- **Type**: Supercar
- **Color**: Blue (0.1, 0.4, 1.0)
- **Style**: Low profile, aggressive stance

### AI Vehicles
1. **AI 0**: Red Sports Car
2. **AI 1**: Orange Muscle Car
3. **AI 2**: Yellow Rally Car
4. **AI 3**: Purple Supercar
5. **AI 4**: Teal Sports Car

## Scene Hierarchy

Each car model creates a hierarchical node structure:

```
CarRoot (e.g., "PlayerVehicle")
├── Body
├── Cabin
├── Hood
├── Rear
├── Wheels
│   ├── Wheel_FL
│   │   ├── Tire_FL
│   │   └── Rim_FL
│   ├── Wheel_FR
│   │   ├── Tire_FR
│   │   └── Rim_FR
│   ├── Wheel_RL
│   │   ├── Tire_RL
│   │   └── Rim_RL
│   └── Wheel_RR
│       ├── Tire_RR
│       └── Rim_RR
├── Spoiler
└── Details
    ├── Bumper_Front
    ├── Bumper_Rear
    ├── Mirror_Left
    ├── Mirror_Right
    ├── Headlight_Left
    └── Headlight_Right
```

## Future Enhancements

### Potential Additions

1. **GLTF Model Support**
   - Load actual car models from `.gltf`/`.glb` files
   - Use the existing `GLTFLoader` in `/src/assets/loaders/GLTFLoader.ts`
   - Example: `const model = await loader.load('models/race_car.gltf')`

2. **Advanced Texturing**
   - Apply generated textures to car materials
   - Use texture slots: albedoMap, normalMap, metallicRoughnessMap
   - Add racing numbers and sponsor decals

3. **Animated Components**
   - Rotating wheels during motion
   - Steering wheel rotation
   - Suspension compression
   - Opening doors/hood

4. **Damage System**
   - Dents and scratches on collision
   - Broken lights and windows
   - Procedural damage textures

5. **Customization**
   - Player-selectable car colors
   - Custom racing numbers
   - Different spoiler styles
   - Rim designs

6. **Environmental Effects**
   - Dirt/mud accumulation on rally cars
   - Reflections on glossy paint
   - Environment mapping for chrome

## Technical Notes

### Performance
- Each car has ~15-20 meshes (body parts + wheels)
- Materials use PBR shading (requires proper lighting)
- Textures are 512x512 by default (configurable)

### Coordinate System
- Cars are built in local space
- Origin at ground level, centered
- Forward direction: +Z axis
- Right direction: +X axis
- Up direction: +Y axis

### Scale
- Cars are approximately 1:1 real-world scale
- Length: 4-5 meters
- Width: 2-2.2 meters
- Height: 1.2-1.5 meters

## Testing

To test the new car models:

```bash
cd examples/racing-game
npm install
npm run dev
```

The game should now display detailed 3D car models with:
- Realistic proportions and shapes
- Multiple body sections (hood, cabin, rear)
- Detailed wheels with tires and rims
- Spoilers and aerodynamic elements
- Proper PBR materials with metallic car paint

## Known Limitations

1. **Texture Application**: Textures are generated but not yet fully integrated into the material system (requires renderer texture binding)
2. **No UV Mapping**: Procedural geometry uses simple box primitives without custom UVs
3. **Static Models**: Wheels don't rotate, suspension doesn't animate
4. **Simplified Geometry**: Uses box primitives instead of curved/smoothed surfaces

## Credits

- **Car Design**: Procedural generation based on real racing car proportions
- **Material System**: Uses G3D StandardPBRMaterial
- **Texture Generation**: Canvas-based procedural texture generation
