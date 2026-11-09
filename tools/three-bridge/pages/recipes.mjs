import * as treeGrove from "../recipes/tree-grove.mjs";
import * as cityBlock from "../recipes/city-block.mjs";
import * as stylizedCar from "../recipes/stylized-car.mjs";
import * as windmill from "../recipes/windmill.mjs";
import * as shaderKiosk from "../recipes/shader-kiosk.mjs";
export const recipes = { "tree-grove": treeGrove, "city-block": cityBlock, "stylized-car": stylizedCar, windmill, "shader-kiosk": shaderKiosk };
export function recipeFromQuery() {
  const name = new URLSearchParams(location.search).get("recipe") ?? "tree-grove";
  return { name, seed: Number(new URLSearchParams(location.search).get("seed") ?? 1) };
}
