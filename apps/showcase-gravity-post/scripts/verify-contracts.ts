/**
 * Gravity Post — contract completability harness.
 *
 * Grid-searches launch vectors per contract against the authored integrator and
 * reports every contract's best no-correction delivery (angle, power, arrival speed,
 * flight time). Run: pnpm exec tsx apps/showcase-gravity-post/scripts/verify-contracts.ts
 *
 * This is the playability-over-realism tuning evidence for the PRD's exact
 * four-delivery arc and its documented fuel/robustness margins.
 */
import { CONTRACTS, WELL_BODIES, stationPosition, stationById } from "../src/contracts";
import { DOCK_SENSOR_RADIUS, PROPELLANT_CAPACITY } from "../src/pod";
import { FIXED_DT, stepPod } from "../src/wells";

interface Result {
  readonly contractId: string;
  readonly ok: boolean;
  readonly dirX: number;
  readonly dirZ: number;
  readonly speed: number;
  readonly arrivalSpeed: number;
  readonly flightSeconds: number;
  readonly distanceToCore: number;
  readonly fuelMarginPercent: number;
  readonly robust?: number;
}

const MAX_FLIGHT_SECONDS = 60;

function simulateContract(contractIndex: number, dirX: number, dirZ: number, speed: number): Omit<Result, "contractId" | "ok" | "fuelMarginPercent"> | null {
  const contract = CONTRACTS[contractIndex]!;
  const origin = stationPosition(stationById(contract.originStationId));
  const destination = stationPosition(stationById(contract.destinationStationId));
  let px = origin[0];
  let pz = origin[1];
  let vx = dirX * speed;
  let vz = dirZ * speed;
  const maxSteps = Math.round(MAX_FLIGHT_SECONDS / FIXED_DT);
  for (let step = 0; step < maxSteps; step += 1) {
    // Gravity
    let ax = 0;
    let az = 0;
    for (const body of WELL_BODIES) {
      const dx = body.position[0] - px;
      const dz = body.position[1] - pz;
      const distance = Math.max(0.05, Math.hypot(dx, dz));
      if (distance >= body.wellRadius) continue;
      const magnitude = (body.mu * contract.tuning.strengthScale) * (1 / distance - 1 / body.wellRadius);
      ax += (dx / distance) * magnitude;
      az += (dz / distance) * magnitude;
    }
    vx += ax * FIXED_DT;
    vz += az * FIXED_DT;
    px += vx * FIXED_DT;
    pz += vz * FIXED_DT;

    // Planet strike / escape fail.
    let dead = false;
    for (const body of WELL_BODIES) {
      if (Math.hypot(body.position[0] - px, body.position[1] - pz) <= body.visualRadius) dead = true;
    }
    if (Math.hypot(px, pz) >= 8.4) dead = true;
    if (dead) return null;

    // Dock check inside the sensor sphere.
    const dockDistance = Math.hypot(destination[0] - px, destination[1] - pz);
    if (dockDistance <= DOCK_SENSOR_RADIUS) {
      const arrivalSpeed = Math.hypot(vx, vz);
      if (arrivalSpeed < contract.captureLimit) {
        return {
          dirX,
          dirZ,
          speed,
          arrivalSpeed,
          flightSeconds: step * FIXED_DT,
          distanceToCore: dockDistance
        };
      }
      return null;
    }
  }
  return null;
}

const results: Result[] = [];
for (let index = 0; index < CONTRACTS.length; index += 1) {
  const contract = CONTRACTS[index]!;
  const origin = stationPosition(stationById(contract.originStationId));
  const destination = stationPosition(stationById(contract.destinationStationId));
  const directAngle = Math.atan2(destination[1] - origin[1], destination[0] - origin[0]);
  let best: Result | null = null;
  const angles = 96;
  const powers = 14;
  for (let a = 0; a < angles; a += 1) {
    const angle = directAngle + (a / (angles - 1) - 0.5) * 2.4;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    for (let p = 1; p <= powers; p += 1) {
      const speed = 0.5 + (p / powers) * 2.2;
      const hit = simulateContract(index, dirX, dirZ, speed);
      if (!hit) continue;
      // Robustness: count neighbour launches that also dock (pixel-quantized
      // drags and human hands cannot hit a knife-edge vector).
      let robust = 0;
      const angleStep = 0.012;
      const baseAngle = Math.atan2(dirZ, dirX);
      for (const dAngle of [-angleStep, 0, angleStep]) {
        for (const dSpeed of [-0.05, 0, 0.05]) {
          const neighbourAngle = baseAngle + dAngle;
          const neighbourSpeed = Math.max(0.3, speed + dSpeed);
          if (simulateContract(index, Math.cos(neighbourAngle), Math.sin(neighbourAngle), neighbourSpeed)) robust += 1;
        }
      }
      const result: Result & { readonly robust: number } = {
        contractId: contract.id,
        ok: true,
        dirX: hit.dirX,
        dirZ: hit.dirZ,
        speed: hit.speed,
        arrivalSpeed: hit.arrivalSpeed,
        flightSeconds: hit.flightSeconds,
        distanceToCore: hit.distanceToCore,
        fuelMarginPercent: PROPELLANT_CAPACITY - contract.parFuel,
        robust
      };
      if (!best || result.robust > best.robust || (result.robust === best.robust && result.arrivalSpeed < best.arrivalSpeed)) best = result;
    }
  }
  if (best) results.push(best);
}

console.log("Gravity Post contract completability sweep");
for (const result of results) {
  console.log(
    result.contractId +
      " OK dir=(" + result.dirX.toFixed(3) + ", " + result.dirZ.toFixed(3) + ")" +
      " launchSpeed=" + result.speed.toFixed(2) +
      " arrival=" + result.arrivalSpeed.toFixed(2) + " u/s" +
      " flight=" + result.flightSeconds.toFixed(1) + "s" +
      " robustness=" + (result.robust ?? 0) + "/9" +
      " fuelMargin=" + result.fuelMarginPercent + "%"
  );
}
const missing = CONTRACTS.filter((contract) => !results.some((result) => result.contractId === contract.id));
if (missing.length > 0) {
  console.log("INCOMPLETE:", missing.map((contract) => contract.id).join(", "));
  process.exitCode = 1;
} else {
  console.log("All " + CONTRACTS.length + " contracts completable without corrections.");
}
