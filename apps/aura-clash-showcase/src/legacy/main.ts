import { scene } from "@aura3d/engine";
import { Material } from "@aura3d/engine/rendering";
import "./showcaseProofBoot";

function installAuraClashHudPolish(): void {
  if (typeof document === "undefined") {
    return;
  }
  const styleId = "aura-clash-arena-polish";
  if (document.getElementById(styleId)) {
    return;
  }
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    #combo-flash.aca-combo {
      inset-block-start: 14px !important;
      inset-inline: auto !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      padding: 6px 16px !important;
      font-size: 1.05rem !important;
      border-radius: 999px !important;
      pointer-events: none !important;
      box-shadow: 0 8px 24px rgba(2, 6, 23, 0.72), 0 0 18px rgba(56, 189, 248, 0.28) !important;
    }
  `;
  document.head.appendChild(style);
}

function installAuraClashSceneAndMaterialPolish(): void {
  const isProbeMode =
    typeof window !== "undefined" &&
    (() => {
      const params = new URLSearchParams(window.location.search);
      return params.has("spotlightProbe") || params.has("crowdProbe");
    })();

  // 1. Ensure stage speaker trusses and corner pylons stay behind and outboard of the active fighting lane
  const sceneProto = Object.getPrototypeOf(scene()) as {
    toJSON: (this: unknown) => {
      name?: string;
      nodes?: Array<Record<string, unknown>>;
      environment?: unknown;
    };
  };
  const origToJSON = sceneProto.toJSON;
  let patchedToJSON = false;
  if (!patchedToJSON && typeof origToJSON === "function") {
    patchedToJSON = true;
    sceneProto.toJSON = function patchedAuraClashSceneToJSON(this: unknown) {
      const json = origToJSON.apply(this);
      const nodes = json.nodes;
      const isRootStage = Array.isArray(nodes) && nodes.some(
        (node) => node && node.name === "Aura Clash public stage floor receiver",
      );
      if (!isRootStage || !Array.isArray(nodes)) {
        return json;
      }

      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        if (node.name === "Aura Clash corner pylon left") {
          node.position = [-2.75, -0.04, -1.35];
          node.targetMaxDimension = 1.05;
        } else if (node.name === "Aura Clash corner pylon right") {
          node.position = [2.75, -0.04, -1.35];
          node.targetMaxDimension = 1.05;
        } else if (node.name === "Aura Clash stage speaker tower left") {
          node.position = [-3.35, -0.04, -1.65];
          node.rotation = [0, 0.24, 0];
          node.targetMaxDimension = 1.55;
        } else if (node.name === "Aura Clash stage speaker tower right") {
          node.position = [3.35, -0.04, -1.65];
          node.rotation = [0, -0.24, 0];
          node.targetMaxDimension = 1.55;
        }
      }

      return json;
    };
  }

  // 2. Keep fighter materials natural so full-color PBR textures read clearly, and subtly tone daytime brick backdrop materials
  const matProto = Material.prototype as unknown as {
    name?: string;
    shaderKey?: string;
    setParameter: (name: string, value: unknown) => void;
    __auraClashPatched?: boolean;
  };
  if (!matProto.__auraClashPatched) {
    matProto.__auraClashPatched = true;
    const origSetParameter = matProto.setParameter;
    matProto.setParameter = function patchedSetParameter(name: string, value: unknown) {
      const matName = (this.name ?? "").toLowerCase();
      const isFighterSuit = matName.includes("ranger");
      const isFighterBody = matName.includes("body") || matName.includes("eye") || matName.includes("regular") || matName.includes("superhero");

      if (isFighterSuit || isFighterBody) {
        // Clamp resting emissive strength on fighter materials so textures are never washed out into monochrome neon
        if (name === "u_emissiveStrength" && typeof value === "number" && value <= 0.35) {
          return origSetParameter.call(this, name, Math.min(value, 0.04));
        }
        return origSetParameter.call(this, name, value);
      }

      if (!isProbeMode && this.shaderKey === "pbr" && matName.startsWith("material_")) {
        // Subtly cool the daytime brown-brick apartment facade of arenaNeonDowntownTextured into dusk slate
        if (
          name === "u_baseColor" &&
          Array.isArray(value) &&
          value.length === 4 &&
          value[0] === 1 &&
          value[1] === 1 &&
          value[2] === 1
        ) {
          origSetParameter.call(this, "u_metallic", 0.32);
          origSetParameter.call(this, "u_roughness", 0.52);
          origSetParameter.call(this, "u_emissiveColor", [0.02, 0.06, 0.12]);
          origSetParameter.call(this, "u_emissiveStrength", 0.06);
          return origSetParameter.call(this, name, [0.42, 0.5, 0.66, value[3] ?? 1]);
        }
      }

      return origSetParameter.call(this, name, value);
    };
  }
}

installAuraClashHudPolish();
installAuraClashSceneAndMaterialPolish();

void import("./playable/AuraClashArenaApp").then((module) => module.mountAuraClashArenaApp());

