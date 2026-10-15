import { model, primitives, scene } from "@aura3d/engine";
import { Material } from "@aura3d/engine/rendering";
import { assets as rootAssets } from "../../../../src/aura-assets";
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

  // 1. Reposition stage trusses/pylons off the fighters and frame the stage with a Cyber-Dojo tournament backdrop
  const sceneProto = Object.getPrototypeOf(scene()) as {
    toJSON: (this: unknown) => {
      name?: string;
      objects: Array<Record<string, unknown>>;
      lights: Array<Record<string, unknown>>;
      environment?: unknown;
    };
  };
  const origToJSON = sceneProto.toJSON;
  let patchedToJSON = false;
  if (!patchedToJSON && typeof origToJSON === "function") {
    patchedToJSON = true;
    sceneProto.toJSON = function patchedAuraClashSceneToJSON(this: unknown) {
      const json = origToJSON.apply(this);
      const isRootStage = json.objects?.some(
        (obj) => obj && obj.name === "Aura Clash public stage floor receiver",
      );
      if (!isRootStage) {
        return json;
      }

      for (const obj of json.objects) {
        if (!obj || typeof obj !== "object") continue;
        const transform = obj.transform as
          | { position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] }
          | undefined;
        if (obj.name === "Aura Clash corner pylon left" && transform) {
          transform.position = [-2.38, 0.02, -0.44];
          obj.normalization = {
            ...(obj.normalization as Record<string, unknown> | undefined),
            targetMaxDimension: 1.22,
          };
        } else if (obj.name === "Aura Clash corner pylon right" && transform) {
          transform.position = [2.38, 0.02, -0.44];
          obj.normalization = {
            ...(obj.normalization as Record<string, unknown> | undefined),
            targetMaxDimension: 1.22,
          };
        } else if (obj.name === "Aura Clash stage speaker tower left" && transform) {
          transform.position = [-2.96, 0.08, -0.54];
          transform.rotation = [0, 0.1, 0];
          obj.normalization = {
            ...(obj.normalization as Record<string, unknown> | undefined),
            targetMaxDimension: 1.85,
          };
        } else if (obj.name === "Aura Clash stage speaker tower right" && transform) {
          transform.position = [2.96, 0.08, -0.54];
          transform.rotation = [0, -0.1, 0];
          obj.normalization = {
            ...(obj.normalization as Record<string, unknown> | undefined),
            targetMaxDimension: 1.85,
          };
        }
      }

      if (!isProbeMode) {
        for (const light of json.lights ?? []) {
          if (light && light.name === "Aura Clash overhead stage spotlight") {
            light.color = "#bae6fd";
            light.intensity = 14;
          }
        }

        const cyberDojoAdditions = [
          // Grounded speaker tower plinths so outer truss towers sit on solid tournament foundations
          primitives
            .box({
              name: "Aura Clash speaker plinth left",
              size: [0.56, 0.2, 0.56],
            })
            .position(-2.96, -0.02, -0.54)
            .material({
              color: "#09111f",
              roughness: 0.44,
              metallic: 0.78,
            })
            .toJSON(),
          primitives
            .box({
              name: "Aura Clash speaker plinth right",
              size: [0.56, 0.2, 0.56],
            })
            .position(2.96, -0.02, -0.54)
            .material({
              color: "#09111f",
              roughness: 0.44,
              metallic: 0.78,
            })
            .toJSON(),
          // 3D Meshy Cyber-Dojo corner guardian statues flanking the tournament backwall
          model(rootAssets.clashFighterMaraMeshy, {
            name: "Aura Clash cyber dojo guardian Mara",
            role: "setDressing",
            scaleMode: "fit",
            targetMaxDimension: 1.15,
            castShadow: true,
            receiveShadow: true,
          })
            .position(-1.95, 0.02, -0.46)
            .rotate(0, 0.35, 0)
            .toJSON(),
          model(rootAssets.clashFighterRookMeshy, {
            name: "Aura Clash cyber dojo guardian Rook",
            role: "setDressing",
            scaleMode: "fit",
            targetMaxDimension: 1.18,
            castShadow: true,
            receiveShadow: true,
          })
            .position(1.95, 0.02, -0.46)
            .rotate(0, -0.35, 0)
            .toJSON(),
          // Cyber-Dojo armored stage backwall screening the daytime brown brick ground floor
          primitives
            .box({
              name: "Aura Clash cyber dojo backwall",
              size: [6.4, 1.72, 0.08],
            })
            .position(0, 0.82, -0.64)
            .material({
              color: "#070d19",
              roughness: 0.48,
              metallic: 0.72,
              emissive: "#0c223d",
              emissiveIntensity: 0.16,
            })
            .toJSON(),
          // Upper tournament gantry header beam
          primitives
            .box({
              name: "Aura Clash cyber dojo header beam",
              size: [6.6, 0.18, 0.14],
            })
            .position(0, 1.74, -0.6)
            .material({
              color: "#0d1729",
              roughness: 0.36,
              metallic: 0.82,
              emissive: "#38bdf8",
              emissiveIntensity: 0.22,
            })
            .toJSON(),
          // Lower stage horizon trim strip
          primitives
            .box({
              name: "Aura Clash cyber dojo lower trim",
              size: [6.2, 0.05, 0.1],
            })
            .position(0, 0.22, -0.59)
            .material({
              color: "#38bdf8",
              roughness: 0.2,
              metallic: 0.35,
              emissive: "#38bdf8",
              emissiveIntensity: 0.42,
            })
            .toJSON(),
          // Mid-height neon tournament accent rail
          primitives
            .box({
              name: "Aura Clash cyber dojo mid trim",
              size: [5.4, 0.04, 0.1],
            })
            .position(0, 1.24, -0.59)
            .material({
              color: "#f59e0b",
              roughness: 0.22,
              metallic: 0.35,
              emissive: "#f59e0b",
              emissiveIntensity: 0.34,
            })
            .toJSON(),
          // Vertical cyber-dojo armor ribs
          ...[-2.75, -1.38, 0, 1.38, 2.75].map((x, idx) =>
            primitives
              .box({
                name: `Aura Clash cyber dojo rib ${idx + 1}`,
                size: [0.16, 1.78, 0.14],
              })
              .position(x, 0.84, -0.59)
              .material({
                color: "#111c30",
                roughness: 0.38,
                metallic: 0.8,
                emissive: idx % 2 === 0 ? "#0ea5e9" : "#f59e0b",
                emissiveIntensity: 0.18,
              })
              .toJSON(),
          ),
        ];

        json.objects.push(...(cyberDojoAdditions as unknown as Array<Record<string, unknown>>));
      }

      return json;
    };
  }

  // 2. Upgrade fighter materials to high-contrast cyber-armor PBR and re-tone daytime brick building materials
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
      const isFighterBody = matName.includes("body") || matName.includes("eye");

      if (isFighterSuit) {
        if (name === "u_roughness" && typeof value === "number") {
          return origSetParameter.call(this, name, Math.min(value, 0.25));
        }
        if (name === "u_metallic" && typeof value === "number") {
          return origSetParameter.call(this, name, Math.max(value, 0.54));
        }
        if (name === "u_emissiveStrength" && typeof value === "number" && value < 0.34) {
          return origSetParameter.call(this, name, 0.34);
        }
        if (name === "u_baseColor" && Array.isArray(value) && value.length === 4) {
          origSetParameter.call(this, "u_clearcoatFactor", 0.42);
          origSetParameter.call(this, "u_clearcoatRoughnessFactor", 0.18);
          origSetParameter.call(this, "u_specularFactor", 0.95);
          origSetParameter.call(this, "u_environmentIntensity", 1.45);
        }
      } else if (isFighterBody) {
        if (name === "u_roughness" && typeof value === "number") {
          return origSetParameter.call(this, name, Math.min(value, 0.42));
        }
        if (name === "u_baseColor" && Array.isArray(value) && value.length === 4) {
          origSetParameter.call(this, "u_clearcoatFactor", 0.14);
          origSetParameter.call(this, "u_specularFactor", 0.72);
        }
      } else if (!isProbeMode && this.shaderKey === "pbr" && matName.startsWith("material_")) {
        // Re-tone the daytime brown-brick apartment facade of arenaNeonDowntownTextured into midnight cyber-slate
        if (
          name === "u_baseColor" &&
          Array.isArray(value) &&
          value.length === 4 &&
          value[0] === 1 &&
          value[1] === 1 &&
          value[2] === 1
        ) {
          origSetParameter.call(this, "u_metallic", 0.64);
          origSetParameter.call(this, "u_roughness", 0.3);
          origSetParameter.call(this, "u_emissiveColor", [0.02, 0.08, 0.18]);
          origSetParameter.call(this, "u_emissiveStrength", 0.18);
          return origSetParameter.call(this, name, [0.16, 0.24, 0.42, value[3] ?? 1]);
        }
      }

      return origSetParameter.call(this, name, value);
    };
  }
}

installAuraClashHudPolish();
installAuraClashSceneAndMaterialPolish();

void import("./playable/AuraClashArenaApp").then((module) => module.mountAuraClashArenaApp());

