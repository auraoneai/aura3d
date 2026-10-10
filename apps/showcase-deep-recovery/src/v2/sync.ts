// Visual node sync — extracted from boot.ts for 14-LOC.
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import { SILT_MOTES, SNOW_COUNT, VENT_COUNT, type DeepWorld } from "./scene/world";
import type { SonarContact } from "../gameplay/sonar";
import type { wireDeepFx } from "./scene/fx";
import type { DeepAudioController } from "../legacy/deep-audio";
import type { DeepCtx } from "./state";

type NodeHandle = AuraRuntimeNodeHandle | undefined;

export function wireDeepSync(ctx: DeepCtx, deps: {
  handle(name: string): NodeHandle;
  world: DeepWorld;
  fx: ReturnType<typeof wireDeepFx>;
  audio: DeepAudioController;
  reducedMotion: boolean;
}) {
  const { handle, world, fx, audio, reducedMotion } = deps;
  function syncVisualNodes(dt: number): void {
    const subNode = handle("sub-root");
    subNode?.setPosition(ctx.subState.x, ctx.subState.y, ctx.subState.z);
    subNode?.setRotation(ctx.subState.pitch, ctx.subState.yaw, ctx.subState.roll);
  
    const lightsOn = ctx.phase !== "blackout";
    const lampNode = handle("sub-lamp-volume");
    lampNode?.setPosition(
      ctx.subState.x + Math.sin(ctx.subState.yaw) * 3.4,
      ctx.subState.y - 0.1,
      ctx.subState.z + Math.cos(ctx.subState.yaw) * 3.4
    );
    lampNode?.setRotation(ctx.subState.pitch, ctx.subState.yaw, 0);
    lampNode?.setVisible(lightsOn);
    for (const [index, side] of [-0.52, 0.52].entries()) {
      const beam = handle(index === 0 ? "sub-lamp-port" : "sub-lamp-starboard");
      const sideX = Math.cos(ctx.subState.yaw) * side;
      const sideZ = -Math.sin(ctx.subState.yaw) * side;
      beam?.setPosition(
        ctx.subState.x + sideX + Math.sin(ctx.subState.yaw) * 3.1,
        ctx.subState.y - 0.2,
        ctx.subState.z + sideZ + Math.cos(ctx.subState.yaw) * 3.1
      );
      beam?.setRotation(Math.PI / 2 + ctx.subState.pitch, ctx.subState.yaw, 0);
      beam?.setVisible(lightsOn);
    }
  
    const breachNode = handle("breach-beacon");
    breachNode?.setPosition(ctx.subState.x, ctx.subState.y + 0.9, ctx.subState.z);
    breachNode?.setVisible(ctx.oxygenState.breached);
  
    // Bioluminescent silt + marine snow drift (killed under reduced motion).
    for (let i = 0; i < SILT_MOTES; i += 1) {
      const drift = reducedMotion ? 0 : Math.sin(ctx.missionTime * 0.7 + i * 1.3) * 0.22;
      const a = i * 1.71;
      const mote = handle(`silt-mote-${i}`);
      mote?.setPosition(
        ctx.subState.x + Math.cos(a) * (2.2 + (i % 4) * 0.8),
        ctx.subState.y - 0.6 + (i % 5) * 0.45 + drift,
        ctx.subState.z + Math.sin(a) * (2.4 + (i % 3) * 0.9)
      );
    }
    for (let i = 0; i < SNOW_COUNT; i += 1) {
      const snow = handle(`marine-snow-${i}`);
      const a = i * 2.39996;
      const r = 4.0 + (i % 7) * 1.6;
      const fall = reducedMotion ? 0 : ((ctx.missionTime * (0.12 + (i % 5) * 0.03) + i * 1.7) % 14);
      snow?.setPosition(
        ctx.subState.x + Math.cos(a) * r,
        ctx.subState.y + 6 - fall,
        ctx.subState.z + Math.sin(a) * r
      );
    }
  
    // Crates follow tether/settle physics.
    for (const c of ctx.crates) {
      const node = handle(`crate-node-${c.id}`);
      node?.setPosition(c.x, c.y, c.z);
      node?.setVisible(!c.banked);
      handle(`sonar-marker-${c.id}`)?.setPosition(c.x, c.y + 0.6, c.z);
    }
  
    // Sonar markers: visible only while their contact is live.
    const liveContacts = new Map<string, SonarContact>(ctx.sonarState.contacts.map((c) => [c.id, c]));
    for (const markerId of world.sonarMarkerIds) {
      const targetId = markerId.slice("sonar-marker-".length);
      const contact = liveContacts.get(targetId);
      const marker = handle(markerId);
      marker?.setVisible(contact !== undefined);
      if (contact && !reducedMotion) {
        const pulse = 0.92 + Math.sin(ctx.missionTime * 7 + contact.distance) * 0.18;
        marker?.setScale([pulse, pulse, 0.08]);
      }
    }
  
    // Sonar pulse wave expanding from the hull.
    const ring = handle("sonar-pulse-ring");
    if (ctx.sonarState.pulseWaveRadius > 0 && ctx.sonarState.pulseWaveRadius < 40) {
      ring?.setPosition(ctx.subState.x, ctx.subState.y, ctx.subState.z);
      ring?.setScale([ctx.sonarState.pulseWaveRadius, 0.05, ctx.sonarState.pulseWaveRadius]);
      ring?.setVisible(true);
    } else {
      ring?.setVisible(false);
    }
  
    // Grapple tether: the amber cable spans sub↔latched crate.
    const tethered = ctx.crates.find((c) => c.tethered && !c.banked);
    const tetherNode = handle("grapple-line");
    if (tetherNode && tethered) {
      const dx = tethered.x - ctx.subState.x;
      const dy = tethered.y - ctx.subState.y;
      const dz = tethered.z - ctx.subState.z;
      const dist = Math.max(0.01, Math.hypot(dx, dy, dz));
      tetherNode.setPosition(ctx.subState.x + dx / 2, ctx.subState.y + dy / 2, ctx.subState.z + dz / 2);
      tetherNode.setRotation(-Math.asin(dy / dist), Math.atan2(dx, dz), 0);
      tetherNode.setScale([0.045, 0.045, dist]);
      tetherNode.setVisible(true);
    } else {
      tetherNode?.setVisible(false);
    }
  
    // Buoy beacon + vent glow breathe (state-light rhythms, reduced-motion safe).
    const buoyPulse = reducedMotion ? 1 : 1 + Math.sin(ctx.missionTime * 2.2) * 0.16;
    handle("buoy-beacon")?.setScale([0.45 * buoyPulse, 0.45 * buoyPulse, 0.45 * buoyPulse]);
    for (let i = 0; i < VENT_COUNT; i += 1) {
      const glow = reducedMotion ? 1 : 1 + Math.sin(ctx.missionTime * 1.4 + i * 2.1) * 0.22;
      handle(`vent-glow-${i}`)?.setScale([0.7 * glow, 0.4 * glow, 0.7 * glow]);
    }
  }

  return { syncVisualNodes };
}
