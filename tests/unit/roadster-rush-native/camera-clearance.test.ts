import { describe, expect, it } from "vitest";
import { RoadsterGame } from "../../../apps/showcase-roadster-rush/src/native/game";
import { Player } from "../../../apps/showcase-roadster-rush/src/native/player";
import { Traffic } from "../../../apps/showcase-roadster-rush/src/native/traffic";
import { FreewayWorld } from "../../../apps/showcase-roadster-rush/src/native/world";
import { FIXED_DT } from "../../../apps/showcase-roadster-rush/src/native/constants";
import { chaseCameraOffsets } from "../../../apps/showcase-roadster-rush/src/render/cinematics";
import { CHASE_CAMERA_BACK, CHASE_CAMERA_UP, cameraClearanceLift, cameraInsideGeometry, createCameraClearance } from "../../../apps/showcase-roadster-rush/src/render/cameraClearance";

/**
 * Owner QA Nov 19: on a sign crash the chase camera briefly went inside the gantry sign. Drive real wrecks in the sim and
 * place the camera exactly as main.ts does (anchor = 0.65 x / 0.85 y of the car minus the speed drop, rig 3.6 up and
 * 5.2 back, plus `cameraClearanceLift`): no frame of the wreck may have the camera inside a sign, a vehicle, or pressed
 * against a sign board looking through it.
 */
function makeGame(seed: number): any {
  const game = new RoadsterGame({ player: new Player(), traffic: new Traffic(), world: new FreewayWorld(), params: new URLSearchParams(`seed=${seed}`), storage: null }) as any;
  game.boot();
  game.start();
  game.simStep(FIXED_DT); // seeds the gantry ring around the start
  return game;
}

/** Vertical angle (deg) of the car centre off the chase camera's fixed look direction (rig [0,3.6,5.2] -> [0,0.6,-6]). */
function carPitchOffAxis(cam: { y: number; z: number }, car: { y: number; z: number }): number {
  const toCar = Math.atan2(car.y + 0.6 - cam.y, cam.z - car.z);
  return Math.abs(toCar - Math.atan2(-3, 11.2)) * (180 / Math.PI);
}

function cameraFrames(game: any, lifted: boolean, seconds = 3): string[] {
  const problems: string[] = [];
  const clearance = createCameraClearance();
  let drop = 0;
  let lastY: number | null = null;
  let lastFree: number | null = null;
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) {
    game.simStep(FIXED_DT);
    const p = game.player;
    drop += (chaseCameraOffsets(Number(p.speed), 0, false).drop - drop) * (1 - Math.exp(-3 * FIXED_DT));
    const cam = { x: p.position.x * 0.65, y: Math.max(0, p.position.y * 0.85) - drop + CHASE_CAMERA_UP, z: p.position.z + CHASE_CAMERA_BACK };
    const gantries = game.world.gantries.map((q: any) => q.position.z);
    const vehicles = game.traffic.vehicles;
    const free = cam.y;
    if (lifted) cam.y += clearance.update(cam, p.position, gantries, vehicles, FIXED_DT);
    const tag = `t${(i * FIXED_DT).toFixed(2)} ${game.mode} cam y${cam.y.toFixed(2)} car y${p.position.y.toFixed(2)}`;
    if (game.mode !== "playing") {
      const why = cameraInsideGeometry(cam, p.position, gantries, vehicles);
      if (why) problems.push(`${tag}: ${why}`);
      if (lifted && carPitchOffAxis(cam, p.position) > 27) problems.push(`${tag}: car out of frame`);
      // a pop the clearance adds on top of the free chase camera (the car itself snapping onto a roof moves both)
      if (lifted && lastY != null && lastFree != null && Math.abs(cam.y - lastY - (free - lastFree)) > 0.5) problems.push(`${tag}: camera popped ${(cam.y - lastY).toFixed(2)} m`);
    }
    lastY = cam.y;
    lastFree = free;
    if (game.mode === "gameover" && game.overT > 0.5) break;
  }
  return problems;
}

function signWreck(lane: number, y: number, speed: number, lifted: boolean): { crashedInto: string | null; problems: string[] } {
  const game = makeGame(7);
  game.traffic.vehicles.length = 0;
  game.traffic.skyCars.length = 0;
  const gz = Math.max(...game.world.gantries.map((q: any) => q.position.z).filter((z: number) => z < 1e4));
  if (!Number.isFinite(gz)) throw new Error("no gantry in the ring");
  game.player.setPose({ lane, z: gz + 6, speed, y, vy: 0 });
  game.traffic.vehicles.length = 0;
  const problems = cameraFrames(game, lifted);
  return { crashedInto: game.crashWhat, problems };
}

describe("Apex Overdrive chase camera stays out of geometry in wrecks", () => {
  it("sign crashes: the camera never enters the gantry or presses against a board (and did before the fix)", () => {
    let unliftedProblems = 0;
    for (const lane of [0, 2, 3]) {
      for (const y of [7.2, 8.4, 9.6, 10.6]) {
        for (const speed of [30, 48, 64]) {
          const fixed = signWreck(lane, y, speed, true);
          expect(fixed.crashedInto).toBe("sign");
          expect(fixed.problems, `lane ${lane} y ${y} speed ${speed}`).toEqual([]);
          unliftedProblems += signWreck(lane, y, speed, false).problems.length;
        }
      }
    }
    // the same wrecks without the clearance lift do put the camera in the sign: the check is real
    expect(unliftedProblems).toBeGreaterThan(0);
  });

  it("traffic crashes: the camera never ends up inside the vehicle the car hit", () => {
    for (const type of ["boxtruck", "bus", "sedan", "van", "pickup"] as const) {
      for (const speed of [30, 55]) {
        const game = makeGame(11);
        game.traffic.vehicles.length = 0;
        game.player.setPose({ lane: 2, speed });
        game.traffic._placeVehicle(type, 2, game.player.position.z - 14);
        const problems = cameraFrames(game, true);
        expect(game.crashWhat, `${type} ${speed}`).toBe(type);
        expect(problems, `${type} ${speed}`).toEqual([]);
      }
    }
  });

  it("the lift is continuous: approaching a gantry the camera glides, it does not pop", () => {
    const gz = -300;
    let last: number | null = null;
    for (let z = gz + 30; z > gz - 10; z -= 0.05) {
      const cam = { x: 0, y: 8.2, z: z + CHASE_CAMERA_BACK };
      const y = cam.y + cameraClearanceLift(cam, { y: 7.6, z }, [gz]);
      if (last != null) expect(Math.abs(y - last)).toBeLessThan(0.12);
      last = y;
    }
  });
});
