// Render sync (aurora bands / pad lights / HUD) — extracted from boot.ts for 14-LOC.
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import type { Game } from "@aura3d/game";
import { SITES, campaignScore } from "../gameplay/sites";
import { LANDER_MAX_HULL } from "../gameplay/touchdown";
import { sampleGridHeight } from "../gameplay/terrain";
import { predictLanding } from "../gameplay/prediction";
import { EXTRACTION_INFRASTRUCTURE } from "./scene/world";
import type { auroraWorldNodes } from "./scene/world";
import type { wireAuroraFx } from "./scene/fx";
import type { AuroraCtx } from "./state";

type NodeHandle = AuraRuntimeNodeHandle | undefined;

export function wireAuroraRender(ctx: AuroraCtx, deps: {
  game: Game;
  world: ReturnType<typeof auroraWorldNodes>;
  handle(name: string): NodeHandle;
  fx: ReturnType<typeof wireAuroraFx>;
  reducedMotion: boolean;
  rigState: { agl: number; x: number; y: number; z: number; padX: number; padY: number; padZ: number };
  loadSite: (index: number) => void;
}) {
  const { game, world, handle, fx, reducedMotion, rigState, loadSite } = deps;
  const FOOT_DROP = 0.72;
  const APPROACH_SCAFFOLD_MIN_AGL = 28;
  const auroraBandNodes = world.sheets.map((_, i) => `aurora-band-${i + 1}`);
  const padLightNames = (index: number) => [1, 2, 3, 4].map((i) => `s${SITES[index]!.id}-pad-light-${i}`);
  
  function syncHud(): void {
    const signature = [
      ctx.siteIndex, ctx.phase, ctx.paused, ctx.lastGrade,
      Math.round(ctx.state.vy * 10), Math.round(ctx.state.fuel), ctx.campaignHull,
      ctx.siteScores.join(","), Math.round(ctx.simSeconds)
    ].join("|");
    if (signature === ctx.lastHudSignature && ctx.frame - ctx.lastHudWrite < 120) return;
    ctx.lastHudSignature = signature;
    ctx.lastHudWrite = ctx.frame;
    const alt = Math.max(0, rigState.agl);
    game.hud.set("site", `SITE ${ctx.currentSite.id} · ${ctx.currentSite.name.toUpperCase()}`);
    game.hud.set("telemetry", `ALT ${alt.toFixed(1)}m  V/S ${ctx.state.vy.toFixed(1)}  TILT ${Math.abs(ctx.state.tiltDeg).toFixed(0)}°`);
    game.hud.set("fuel", `FUEL ${Math.max(0, (ctx.state.fuel / ctx.currentSite.fuelBudget) * 100).toFixed(0)}%`);
    game.hud.set("hull", `HULL ${Math.round((ctx.campaignHull / LANDER_MAX_HULL) * 100)}%`);
    game.hud.set("score", `${campaignScore(SITES.map((_, i) => ctx.siteScores[i] ?? 0))}`);
    game.hud.set("message",
      ctx.paused ? "PAUSED — P TO RESUME"
        : ctx.phase === "crashed" ? `CRASH — ${ctx.crashReason}. R TO RESTART`
          : ctx.phase === "campaign-clear" ? `CAMPAIGN CLEAR — R FOR NEW EXPEDITION`
            : ctx.phase === "landed" ? `${(ctx.lastGrade ?? "").toUpperCase()} LANDING — NEXT SITE…`
              : "W THRUST · A/D ROTATE · G GHOST · P PAUSE");
  }
  
  function renderUpdate(dtFrame: number): void {
    if (!ctx.field) return;
    const landerNode = handle("lander");
    landerNode?.setPosition(ctx.state.x, ctx.state.y, ctx.state.z)
      .setRotation(0, ctx.state.yaw, (ctx.state.tiltDeg * Math.PI) / 180);
  
    const groundHere = sampleGridHeight(ctx.field, ctx.state.x, ctx.state.z);
    const altitudeAboveGround = ctx.state.y - FOOT_DROP - groundHere;
    rigState.x = ctx.state.x;
    rigState.y = ctx.state.y;
    rigState.z = ctx.state.z;
    rigState.agl = Math.max(0, altitudeAboveGround);
  
    // Plume: visible thrust flame scaled by throttle while the engine burns.
    const burning = ctx.phase === "flying" && !ctx.paused && ctx.previousControls.thrust > 0 && ctx.state.fuel > 0;
    const plumeScale = burning ? 0.5 + ctx.previousControls.thrust * 0.7 : 0.001;
    handle("thrust-plume")
      ?.setPosition(ctx.state.x - Math.sin(ctx.state.yaw) * 0.1, ctx.state.y - FOOT_DROP * 1.35, ctx.state.z - Math.cos(ctx.state.yaw) * 0.1)
      .setScale([plumeScale * 0.45, plumeScale * 2.4, plumeScale * 0.45]);
  
    // Bounded estimate: same integrator + sampler as gameplay, every 6 frames.
    if (ctx.phase === "flying" && (ctx.latestPrediction === null || ctx.frame % 6 === 0)) {
      ctx.latestPrediction = predictLanding(
        ctx.state,
        ctx.previousControls,
        (x: number, z: number) => sampleGridHeight(ctx.field!, x, z),
        FOOT_DROP,
        ctx.currentSite.gust
      );
    }
    if (ctx.phase === "flying" && ctx.latestPrediction) {
      handle("landing-prediction")
        ?.setVisible(true)
        .setPosition(ctx.latestPrediction.x, ctx.latestPrediction.y, ctx.latestPrediction.z)
        .setScale(ctx.latestPrediction.reachedSurface ? [1.15, 1.15, 0.08] : [0.72, 0.72, 0.06]);
    } else {
      handle("landing-prediction")?.setVisible(false);
    }
  
    // Whiteout: site-owned density; reduced motion freezes the drift.
    const whiteoutCount = Math.round(72 * ctx.currentSite.whiteout);
    const weatherTime = reducedMotion ? 0 : ctx.simSeconds;
    const gustOffset = ctx.currentSite.gust ? Math.sin(weatherTime * 0.7) * ctx.currentSite.gust.amplitude * 2 : 0;
    for (let index = 0; index < 72; index += 1) {
      const node = handle(`whiteout-${index + 1}`);
      const visible = index < whiteoutCount && ctx.phase !== "campaign-clear";
      node?.setVisible(visible);
      if (!visible) continue;
      const lane = (index * 37) % 72;
      node
        ?.setPosition(
          ctx.state.x + (((lane * 17) % 41) - 20) * 0.55 + gustOffset,
          ctx.state.y + (((lane * 11 + Math.floor(weatherTime * 7)) % 31) - 15) * 0.42,
          ctx.state.z + (((lane * 23 + Math.floor(weatherTime * 4)) % 47) - 23) * 0.5
        )
        .setScale(ctx.currentSite.whiteout >= 0.6 ? [0.04, 0.11, 0.04] : [0.035, 0.075, 0.035]);
    }
  
    // Extraction tableau on campaign-clear, launch gantry under the approach.
    const extractionVisible = ctx.phase === "campaign-clear";
    const extractionPad = ctx.currentSite.pads[0]!;
    const extractionGround = ctx.field.padHeights[0] ?? groundHere;
    const approachScaffoldVisible = ctx.phase === "flying" && altitudeAboveGround > APPROACH_SCAFFOLD_MIN_AGL;
    handle("extraction-title")
      ?.setVisible(extractionVisible)
      .setPosition(extractionPad.x - 5.8, extractionGround + 5.2, extractionPad.z - 1.5);
    handle("extraction-halo")
      ?.setVisible(extractionVisible)
      .setPosition(extractionPad.x, extractionGround + 0.18, extractionPad.z);
    handle("extraction-bay-backdrop")
      ?.setVisible(extractionVisible)
      .setPosition(extractionPad.x - 3.5, extractionGround - 10.25, extractionPad.z - 4.25)
      .setRotation(0, 0.69, 0);
    handle("extraction-lander")
      ?.setVisible(extractionVisible)
      .setPosition(ctx.state.x, ctx.state.y, ctx.state.z)
      .setRotation(0, 0.69, 0);
    EXTRACTION_INFRASTRUCTURE.forEach((part, index) => {
      const node = handle(`extraction-${part.id}`);
      node?.setVisible(extractionVisible || approachScaffoldVisible);
      if (extractionVisible) {
        node?.setPosition(extractionPad.x + part.offset[0], extractionGround + part.offset[1], extractionPad.z + part.offset[2]);
      } else if (approachScaffoldVisible) {
        const scaffoldY = ctx.currentSite.spawn.y - FOOT_DROP - 0.25;
        node?.setPosition(ctx.currentSite.spawn.x + part.offset[0], scaffoldY + part.offset[1], ctx.currentSite.spawn.z + part.offset[2]);
      }
    });
    landerNode?.setVisible(!extractionVisible);
  
    // Dust kicks under the plume near the ground.
    const dustActive = burning && altitudeAboveGround < 11;
    for (let index = 0; index < 12; index += 1) {
      const node = handle(`dust-${index + 1}`);
      if (!dustActive) {
        node?.setScale(0.001);
        continue;
      }
      const cycle = (ctx.simSeconds * 2.2 + index / 12) % 1;
      const angle = (index / 12) * Math.PI * 2;
      const radius = 0.7 + cycle * 2.6;
      node
        ?.setPosition(
          ctx.state.x + Math.cos(angle) * radius,
          groundHere + 0.25 + cycle * 0.9,
          ctx.state.z + Math.sin(angle) * radius
        )
        .setScale(0.16 + cycle * 0.55 * (1 - cycle * 0.4));
    }
  
    // Pad approach lights pulse in sequence.
    const pulsePhase = Math.floor((ctx.simSeconds * 2.4) % 4);
    padLightNames(ctx.siteIndex).forEach((name, index) => {
      handle(name)?.setScale(index === pulsePhase ? 0.42 : 0.22);
    });
  
    // Aurora sway — delta on each sheet's authored rotation, never absolute.
    auroraBandNodes.forEach((name, index) => {
      const sheet = world.sheets[index];
      if (!sheet) return;
      handle(name)?.setRotation(
        sheet.tiltX + Math.sin(ctx.simSeconds * 0.35 + index) * 0.012,
        sheet.tiltY + Math.sin(ctx.simSeconds * 0.21 + index * 0.7) * 0.02,
        sheet.tiltZ + Math.cos(ctx.simSeconds * 0.17 + index * 0.5) * 0.015
      );
    });
  
    // Crash debris ballistics + shockwave ring.
    if (ctx.crashDebris.length > 0) {
      let alive = false;
      ctx.crashDebris.forEach((piece, index) => {
        if (piece.life <= 0) return;
        alive = true;
        piece.life -= dtFrame;
        piece.vy -= 12 * dtFrame;
        piece.x += piece.vx * dtFrame;
        piece.y += piece.vy * dtFrame;
        piece.z += piece.vz * dtFrame;
        const floor = sampleGridHeight(ctx.field!, piece.x, piece.z);
        if (piece.y < floor + 0.08) {
          piece.y = floor + 0.08;
          piece.vy *= -0.32;
          piece.vx *= 0.72;
          piece.vz *= 0.72;
        }
        handle(`debris-${index + 1}`)
          ?.setPosition(piece.x, piece.y, piece.z)
          .setRotation(piece.x * 3 % Math.PI, piece.z * 2 % Math.PI, piece.y % Math.PI)
          .setScale(piece.life > 0 ? 0.18 : 0.001);
      });
      if (!alive) ctx.crashDebris = [];
    }
    if (ctx.shockwaveAge >= 0) {
      ctx.shockwaveAge += dtFrame;
      if (ctx.shockwaveAge > 0.7) {
        ctx.shockwaveAge = -1;
        handle("impact-shockwave")?.setPosition(0, -50, 0).setScale(0.001);
      } else {
        const t = ctx.shockwaveAge / 0.7;
        handle("impact-shockwave")?.setScale([2 + t * 14, 0.24 * (1 - t), 2 + t * 14]);
      }
    }
  
    if (ctx.advanceTimer > 0) {
      ctx.advanceTimer -= dtFrame;
      if (ctx.advanceTimer <= 0 && ctx.phase === "landed") {
        loadSite(Math.min(SITES.length - 1, ctx.siteIndex + 1));
      }
    }
  
    syncHud();
  }

  return { syncHud, renderUpdate };
}
