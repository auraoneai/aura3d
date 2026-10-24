import { writeFileSync } from "node:fs";
import {
  PLAYER_HALF_LENGTH,
  PLAYER_RADIUS,
  TRAFFIC_FOOTPRINTS,
  createTrafficContacts,
  type PlayerBody,
  type TrafficBody
} from "../../apps/showcase-teleoperator/src/collision";

const DT = 1 / 60;
const SPEEDS = [8, 16, 30];

function run(slot: number, player: PlayerBody, car: TrafficBody, steps: number) {
  const contacts = createTrafficContacts(10);
  const [length, width] = TRAFFIC_FOOTPRINTS[slot]!;
  const halfZ = length / 2 + (PLAYER_HALF_LENGTH - PLAYER_RADIUS) + PLAYER_RADIUS;
  const halfX = width / 2 + PLAYER_RADIUS;
  const cars = Array.from({ length: 10 }, (_, i) => (i === slot ? car : { laneX: 99, z: 9999, speed: 0, direction: 1 as const }));
  let events = 0;
  let approach = 0;
  let maxOverlap = -Infinity;
  const startSpeed = player.speed;
  for (let i = 0; i < steps; i++) {
    car.z += (car.direction === 1 ? -car.speed : car.speed) * DT;
    player.z -= player.speed * DT;
    player.x += player.lateral * DT;
    for (const h of contacts.step(player, cars, DT)) {
      events += 1;
      approach = Math.max(approach, h.impact.speed);
    }
    maxOverlap = Math.max(maxOverlap, Math.min(halfZ - Math.abs(player.z - car.z), halfX - Math.abs(player.x - car.laneX)));
  }
  return {
    events,
    approachSpeedMps: Number(approach.toFixed(2)),
    startSpeedMps: startSpeed,
    speedAfterMps: Number(player.speed.toFixed(2)),
    maxPenetrationM: Number(Math.max(0, maxOverlap).toFixed(3)),
    passedThrough: player.z <= car.z && car.direction === 1 && startSpeed > car.speed ? true : false
  };
}

const rows: Record<string, unknown>[] = [];
for (const speed of SPEEDS) {
  rows.push({ case: "rear-end", playerSpeed: speed, carSpeed: 4, ...run(0, { x: 3.4, z: 0, speed, lateral: 0 }, { laneX: 3.4, z: -40, speed: 4, direction: 1 }, 600) });
  rows.push({ case: "head-on", playerSpeed: speed, carSpeed: 13, ...run(1, { x: -3.2, z: 0, speed, lateral: 0 }, { laneX: -3.2, z: -80, speed: 13, direction: -1 }, 600) });
  rows.push({ case: "side-swipe", playerSpeed: 10, lateralSpeed: speed / 4, carSpeed: 10, ...run(2, { x: 3.4, z: 0, speed: 10, lateral: speed / 4 }, { laneX: 7.4, z: -1, speed: 10, direction: 1 }, 240) });
}
writeFileSync("evidence/teleoperator/rework/unit-measurements.json", JSON.stringify(rows, null, 2) + "\n");
console.table(rows);
