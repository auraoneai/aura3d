// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraCityBlockOptions, AuraColor, AuraSceneNode, AuraTransformSpec, AuraVec3 } from "../../index.js";
import { makeBuildingDetails, makeBuildingWindowRows, makeCityCrosswalk, makeCityProps, makeCityRoadMarkings, makeCityVehicle, primitives } from "../../index.js";
import { instances } from "../instances.js";
import { material } from "../material.js";

export const cityBlock = (options: AuraCityBlockOptions = {}): readonly AuraSceneNode[] => {
    const blocks = Math.max(3, Math.min(30, options.blocks ?? 20));
    const timeOfDay = options.timeOfDay ?? "night";
    const night = timeOfDay === "night";
    const road = material.pbr({ color: night ? "#0a0f16" : "#3f474b", roughness: 0.78 });
    const sideRoad = material.pbr({ color: night ? "#101820" : "#58636b", roughness: 0.78 });
    const sidewalk = material.pbr({ color: night ? "#334155" : "#b7c5cf", roughness: 0.84, metallic: 0.02 });
    const curb = night
      ? material.emissive({ color: "#e8f5ff", emissive: "#bdefff", emissiveIntensity: 1.6 })
      : material.pbr({ color: "#eef4f8", roughness: 0.58, metallic: 0.01 });
    const nodes: AuraSceneNode[] = [
      primitives.plane({ name: "asphalt street grid", material: material.pbr({ color: timeOfDay === "night" ? "#2f3a37" : "#9fb49b", roughness: 0.86, metallic: 0.02 }) }).position(0, -0.04, 0).scale([20, 1, 20]).toJSON(),
      primitives.box({ name: "main north south road", material: road }).position(0, 0.012, 0).scale([0.44, 0.024, 10.8]).toJSON(),
      primitives.box({ name: "main east west road", material: road }).position(0, 0.014, 0).scale([11.4, 0.024, 0.44]).toJSON(),
      primitives.box({ name: "left city avenue", material: sideRoad }).position(-3.45, 0.013, 0).scale([0.3, 0.022, 10.8]).toJSON(),
      primitives.box({ name: "right city avenue", material: sideRoad }).position(2.55, 0.013, 0).scale([0.3, 0.022, 10.8]).toJSON(),
      primitives.box({ name: "front cross street", material: sideRoad }).position(0, 0.015, -2.7).scale([11.4, 0.022, 0.3]).toJSON(),
      primitives.box({ name: "back cross street", material: sideRoad }).position(0, 0.015, 2.55).scale([11.4, 0.022, 0.3]).toJSON(),
      primitives.box({ name: "northwest raised sidewalk slab", material: sidewalk }).position(-1.76, 0.006, 1.32).scale([2.42, 0.036, 1.76]).toJSON(),
      primitives.box({ name: "northeast raised sidewalk slab", material: sidewalk }).position(1.66, 0.006, 1.32).scale([2.24, 0.036, 1.76]).toJSON(),
      primitives.box({ name: "southwest raised sidewalk slab", material: sidewalk }).position(-1.76, 0.006, -1.42).scale([2.42, 0.036, 1.82]).toJSON(),
      primitives.box({ name: "southeast raised sidewalk slab", material: sidewalk }).position(1.66, 0.006, -1.42).scale([2.24, 0.036, 1.82]).toJSON(),
      primitives.box({ name: "central intersection curb north", material: curb }).position(0, 0.052, 0.62).scale([1.32, 0.028, 0.035]).toJSON(),
      primitives.box({ name: "central intersection curb south", material: curb }).position(0, 0.052, -0.62).scale([1.32, 0.028, 0.035]).toJSON(),
      primitives.box({ name: "central intersection curb west", material: curb }).position(-0.62, 0.052, 0).scale([0.035, 0.028, 1.32]).toJSON(),
      primitives.box({ name: "central intersection curb east", material: curb }).position(0.62, 0.052, 0).scale([0.035, 0.028, 1.32]).toJSON(),
      primitives.box({ name: "left road stripe", material: material.emissive({ color: "#f7d66b", emissive: "#f7d66b" }) }).position(-0.18, 0.032, 0).scale([0.035, 0.02, 15.2]).toJSON(),
      primitives.box({ name: "right road stripe", material: material.emissive({ color: "#f7d66b", emissive: "#f7d66b" }) }).position(0.18, 0.032, 0).scale([0.035, 0.02, 15.2]).toJSON(),
      primitives.box({ name: "cross street white line", material: material.emissive({ color: "#e8eef5", emissive: "#e8eef5" }) }).position(0, 0.034, 0.24).scale([15.4, 0.02, 0.035]).toJSON(),
      ...makeCityRoadMarkings(timeOfDay),
      ...makeCityCrosswalk("zebra crosswalk near", 0, -0.34, "northSouth"),
      ...makeCityCrosswalk("zebra crosswalk far", 0, 0.72, "northSouth"),
      ...makeCityCrosswalk("zebra crosswalk west", -0.72, 0, "eastWest"),
      ...makeCityCrosswalk("zebra crosswalk east", 0.72, 0, "eastWest")
    ];
    const cityTowerTransforms: AuraTransformSpec[] = [];
    const cityTowerColors: AuraColor[] = [];
    const xSlots = [-4.25, -2.58, -0.95, 1.45, 3.3];
    const zSlots = [-4, -1.45, 1.3, 3.65];
    for (let index = 0; index < blocks; index += 1) {
      const col = index % 5;
      const row = Math.floor(index / 5);
      const x = xSlots[col] ?? ((col - 2) * 1.85);
      const z = zSlots[row] ?? (-4 + row * 2.25);
      const height = 1.15 + ((index * 7) % 6) * 0.45 + (col === 0 || col === 4 ? 0.25 : 0);
      const color = night
        ? (index % 3 === 0 ? "#1e293b" : index % 3 === 1 ? "#2d3340" : "#172233")
        : (index % 3 === 0 ? "#8ea2aa" : index % 3 === 1 ? "#b89b72" : "#668094");
      cityTowerTransforms.push({ position: [x, height / 2, z], scale: [1.08, height, 1.08] });
      cityTowerColors.push(color);
      if (options.litWindows !== false) {
        nodes.push(...makeBuildingWindowRows(x, z, height, index, timeOfDay));
      }
      nodes.push(...makeBuildingDetails(x, z, height, index, timeOfDay));
    }
    nodes.push(instances.box({
      name: "city tower native instanced family",
      transforms: cityTowerTransforms,
      colors: cityTowerColors,
      material: material.pbr({ color: "#ffffff", roughness: 0.68, metallic: 0.06 })
    }).toJSON());
    const lampPositions: AuraVec3[] = [
      [-1.15, 0, 0.85], [1.15, 0, 0.85], [-1.15, 0, -0.85], [1.15, 0, -0.85],
      [-3.85, 0, -2.05], [-2.95, 0, 2.05], [2.05, 0, -2.05], [3.05, 0, 2.05],
      [-5.15, 0, 0.15], [4.25, 0, -0.15], [-0.2, 0, -3.18], [0.2, 0, 3.05]
    ];
    for (let index = 0; index < lampPositions.length; index += 1) {
      const [x, , z] = lampPositions[index];
      nodes.push(primitives.cylinder({ name: `street light pole ${index + 1}`, material: material.metal({ color: "#6f7d86", roughness: 0.32 }) }).position(x, 0.34, z).scale([0.035, 0.68, 0.035]).toJSON());
      nodes.push(primitives.sphere({
        name: timeOfDay === "night" ? `bright night street lamp ${index + 1}` : `muted daylight street lamp ${index + 1}`,
        material: timeOfDay === "night"
          ? material.emissive({ color: "#ff7a00", emissive: "#ff7a00", emissiveIntensity: 1.85 })
          : material.pbr({ color: "#f1f5f9", roughness: 0.42, metallic: 0.04 })
      }).position(x, 0.74, z).scale(timeOfDay === "night" ? 0.16 : 0.07).toJSON());
      if (timeOfDay === "night") {
        nodes.push(primitives.cylinder({
          name: `gold night lamp glow pool ${index + 1}`,
          material: material.emissive({ color: "#ff6a00", emissive: "#ff6a00", emissiveIntensity: 1.15, opacity: 0.82 })
        }).position(x, 0.038, z).scale([0.84, 0.012, 0.84]).toJSON());
      }
    }
    if (timeOfDay === "night") {
      nodes.push(
        primitives.box({ name: "visible dark night road evidence north south", material: material.emissive({ color: "#34383d", emissive: "#34383d", emissiveIntensity: 0.24, opacity: 0.92 }) }).position(0, 0.049, -0.1).scale([0.5, 0.016, 4.8]).toJSON(),
        primitives.box({ name: "visible dark night road evidence east west", material: material.emissive({ color: "#34383d", emissive: "#34383d", emissiveIntensity: 0.24, opacity: 0.92 }) }).position(0, 0.05, -0.1).scale([5.2, 0.016, 0.5]).toJSON(),
        primitives.box({ name: "visible white night crosswalk evidence near", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc", emissiveIntensity: 0.78 }) }).position(0, 0.072, -0.42).scale([1.42, 0.018, 0.055]).toJSON(),
        primitives.box({ name: "visible white night crosswalk evidence far", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc", emissiveIntensity: 0.78 }) }).position(0, 0.073, 0.54).scale([1.42, 0.018, 0.055]).toJSON(),
        primitives.box({ name: "warm amber streetlight pool foreground left", material: material.emissive({ color: "#ff6a00", emissive: "#ff6a00", emissiveIntensity: 1.15, opacity: 0.86 }) }).position(-1.12, 0.055, -0.72).scale([0.82, 0.02, 0.32]).toJSON(),
        primitives.box({ name: "warm amber streetlight pool foreground right", material: material.emissive({ color: "#ff6a00", emissive: "#ff6a00", emissiveIntensity: 1.15, opacity: 0.86 }) }).position(1.12, 0.055, -0.72).scale([0.82, 0.02, 0.32]).toJSON(),
        primitives.box({ name: "warm amber streetlight pool avenue left", material: material.emissive({ color: "#ff6a00", emissive: "#ff6a00", emissiveIntensity: 1.05, opacity: 0.82 }) }).position(-3.05, 0.055, 0.2).scale([0.36, 0.02, 0.9]).toJSON(),
        primitives.box({ name: "warm amber streetlight pool avenue right", material: material.emissive({ color: "#ff6a00", emissive: "#ff6a00", emissiveIntensity: 1.05, opacity: 0.82 }) }).position(2.2, 0.055, 0.2).scale([0.36, 0.02, 0.9]).toJSON()
      );
    }
    nodes.push(
      ...makeCityProps(timeOfDay),
      ...makeCityVehicle("red northbound", -0.18, -1.7, "#ef4444", 0),
      ...makeCityVehicle("blue southbound", 0.2, 1.78, "#2563eb", 3.1416),
      ...makeCityVehicle("yellow crosstown taxi", -2.0, 0.22, "#facc15", 1.5708),
      ...makeCityVehicle("white crosstown van", 2.0, -0.22, "#f8fafc", -1.5708),
      primitives.sphere({
        name: timeOfDay === "night" ? "large moon over procedural city sky" : "bright sun over procedural city sky",
        material: material.emissive({
          color: timeOfDay === "night" ? "#dbeafe" : "#fde047",
          emissive: timeOfDay === "night" ? "#93c5fd" : "#facc15",
          emissiveIntensity: timeOfDay === "night" ? 1.6 : 2.4
        })
      }).position(4.62, 4.4, -4.35).scale(timeOfDay === "night" ? 0.34 : 0.46).toJSON(),
      primitives.sphere({
        name: timeOfDay === "night" ? "soft blue city glow dome" : "warm daytime sky haze dome",
        material: material.emissive({
          color: timeOfDay === "night" ? "#0b1f3a" : "#bae6fd",
          emissive: timeOfDay === "night" ? "#1d4ed8" : "#7dd3fc",
          opacity: timeOfDay === "night" ? 0.2 : 0.12
        })
      }).position(0, 2.8, -4.65).scale([4.4, 1.0, 0.08]).toJSON(),
      primitives.box({ name: "foreground day night state board", material: material.pbr({ color: "#08111f", roughness: 0.48, metallic: 0.16 }) }).position(-1.38, 0.22, 4.92).scale([1.72, 0.22, 0.08]).toJSON(),
      primitives.sphere({ name: "large day sun state marker", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-2.0, 0.58, 4.9).scale(0.22).toJSON(),
      primitives.sphere({ name: "large night moon state marker", material: material.emissive({ color: "#dbeafe", emissive: "#93c5fd" }) }).position(-0.76, 0.58, 4.9).scale(0.22).toJSON(),
      primitives.box({
        name: timeOfDay === "night" ? "foreground active night state bar" : "foreground active day state bar",
        material: material.emissive({ color: timeOfDay === "night" ? "#93c5fd" : "#fde047", emissive: timeOfDay === "night" ? "#93c5fd" : "#fde047" })
      }).position(timeOfDay === "night" ? -0.76 : -2.0, 0.34, 4.82).scale([0.42, 0.06, 0.045]).toJSON(),
      primitives.box({ name: "night streetlight glow proof strip", material: material.emissive({ color: timeOfDay === "night" ? "#fbbf24" : "#fde68a", emissive: timeOfDay === "night" ? "#fbbf24" : "#fde68a" }) }).position(1.36, 0.045, 3.72).scale([1.1, 0.018, 0.16]).toJSON(),
      primitives.box({ name: "day night toggle pedestal", material: material.pbr({ color: "#0f172a", roughness: 0.62, metallic: 0.08 }) }).position(-4.95, 0.09, 4.82).scale([0.88, 0.16, 0.34]).toJSON(),
      primitives.sphere({ name: "gold sun icon on day night toggle", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-5.28, 0.32, 4.82).scale(0.16).toJSON(),
      primitives.sphere({ name: "silver moon icon on day night toggle", material: material.emissive({ color: "#dbeafe", emissive: "#93c5fd" }) }).position(-4.62, 0.32, 4.82).scale(0.16).toJSON(),
      primitives.box({
        name: timeOfDay === "night" ? "active night state toggle knob" : "active day state toggle knob",
        material: material.emissive({ color: timeOfDay === "night" ? "#93c5fd" : "#fde047", emissive: timeOfDay === "night" ? "#93c5fd" : "#fde047" })
      }).position(timeOfDay === "night" ? -4.62 : -5.28, 0.2, 4.48).scale([0.26, 0.08, 0.12]).toJSON(),
      primitives.box({ name: "red traffic signal over intersection", material: material.emissive({ color: "#ef4444", emissive: "#ef4444" }) }).position(-0.58, 0.9, -0.58).scale([0.11, 0.11, 0.035]).toJSON(),
      primitives.box({ name: "green traffic signal over intersection", material: material.emissive({ color: "#22c55e", emissive: "#22c55e" }) }).position(0.58, 0.9, 0.58).scale([0.11, 0.11, 0.035]).toJSON()
    );
    return nodes;
  }
