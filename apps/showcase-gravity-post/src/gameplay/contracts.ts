/**
 * Gravity Post — the four-delivery teach/combine/mastery courier shift.
 *
 * Origin/destination reference station ids; bonusBody is the flyby body that
 * pays a bonus when the pod passes close during that contract. parFuel is the
 * expected propellant remaining on a competent flight (route-local design
 * values, tuned for playability over realism).
 */
import type { WellBody, WellTuning } from "./wells";

export interface StationSpec {
  readonly id: string;
  readonly name: string;
  /** Which well body this station orbits (static authored offset). */
  readonly bodyId: string;
  /** Offset from the body center on the play plane. */
  readonly offset: readonly [number, number];
}

export interface ContractSpec {
  readonly id: string;
  readonly title: string;
  readonly briefing: string;
  readonly originStationId: string;
  readonly destinationStationId: string;
  /** Body whose close flyby pays a bonus (may equal origin/destination). */
  readonly bonusBodyId: string | null;
  /** Max relative speed at dock for capture (units/second). */
  readonly captureLimit: number;
  /** Expected propellant remaining after a clean delivery. */
  readonly parFuel: number;
  /** Real-time flight budget before this dispatch consumes one hull. */
  readonly timeLimitSeconds: number;
  /** Bounded prograde/retrograde corrections available after launch. */
  readonly correctionTokens: 0 | 1;
  readonly tuning: WellTuning;
}

export const STATIONS: readonly StationSpec[] = [
  { id: "sol-relay", name: "Sol Relay", bodyId: "sol", offset: [1.35, 0.55] },
  { id: "cinder-depot", name: "Cinder Depot", bodyId: "cinder", offset: [0.52, -0.34] },
  { id: "verdance-hub", name: "Verdance Hub", bodyId: "verdance", offset: [-0.62, -0.42] },
  { id: "aquaria-post", name: "Aquaria Post", bodyId: "aquaria", offset: [0.58, 0.5] },
  { id: "rust-exchange", name: "Rust Exchange", bodyId: "rust", offset: [0.44, 0.56] },
  { id: "gale-terminal", name: "Gale Terminal", bodyId: "gale", offset: [0.95, -0.98] }
];

export const CONTRACTS: readonly ContractSpec[] = [
  {
    id: "GP-CON-1",
    title: "Delivery 1 — Direct dispatch",
    briefing: "Sol Relay to Aquaria Post. Read the cyan prediction and fly the direct cream route.",
    originStationId: "sol-relay",
    destinationStationId: "aquaria-post",
    bonusBodyId: null,
    captureLimit: 2.1,
    parFuel: 92,
    timeLimitSeconds: 32,
    correctionTokens: 0,
    tuning: { strengthScale: 1 }
  },
  {
    id: "GP-CON-2",
    title: "Delivery 2 — Single assist",
    briefing: "Aquaria Post to Cinder Depot. Skim Verdance once, then settle below capture speed.",
    originStationId: "aquaria-post",
    destinationStationId: "cinder-depot",
    bonusBodyId: "verdance",
    captureLimit: 2,
    parFuel: 88,
    timeLimitSeconds: 42,
    correctionTokens: 1,
    tuning: { strengthScale: 1 }
  },
  {
    id: "GP-CON-3",
    title: "Delivery 3 — Chained curve",
    briefing: "Cinder Depot to Rust Exchange. Chain two distinct wells, then spend the one correction token only if the live path drifts.",
    originStationId: "cinder-depot",
    destinationStationId: "rust-exchange",
    bonusBodyId: "sol",
    captureLimit: 1.9,
    parFuel: 84,
    timeLimitSeconds: 48,
    correctionTokens: 1,
    tuning: { strengthScale: 1.05 }
  },
  {
    id: "GP-CON-4",
    title: "Delivery 4 — Hazard mail",
    briefing: "Rust Exchange to Gale Terminal. Preserve hulls through the red collision zones and complete the four-stop shift.",
    originStationId: "rust-exchange",
    destinationStationId: "gale-terminal",
    bonusBodyId: null,
    captureLimit: 1.8,
    parFuel: 80,
    timeLimitSeconds: 46,
    correctionTokens: 1,
    tuning: { strengthScale: 1.1 }
  }
];

/** The five planets + sun as authored wells (sun + 5 per the PRD). */
export const WELL_BODIES: readonly WellBody[] = [
  { id: "sol", name: "Sol", position: [0, 0], visualRadius: 0.34, wellRadius: 2.9, mu: 2.4, flybyRadius: 1.9 },
  { id: "cinder", name: "Cinder", position: [2.05, 1.15], visualRadius: 0.085, wellRadius: 0.95, mu: 0.5, flybyRadius: 0.62 },
  { id: "verdance", name: "Verdance", position: [-1.75, 1.85], visualRadius: 0.11, wellRadius: 1.18, mu: 0.72, flybyRadius: 0.78 },
  { id: "aquaria", name: "Aquaria", position: [-2.85, -1.15], visualRadius: 0.12, wellRadius: 1.32, mu: 0.88, flybyRadius: 0.86 },
  { id: "rust", name: "Rust", position: [1.25, -2.65], visualRadius: 0.095, wellRadius: 1.06, mu: 0.62, flybyRadius: 0.7 },
  { id: "gale", name: "Gale", position: [3.45, -1.7], visualRadius: 0.21, wellRadius: 1.75, mu: 1.55, flybyRadius: 1.25 }
];

export function stationById(id: string): StationSpec {
  const station = STATIONS.find((candidate) => candidate.id === id);
  if (!station) throw new Error("Unknown station: " + id);
  return station;
}

export function stationPosition(station: StationSpec): readonly [number, number] {
  const body = WELL_BODIES.find((candidate) => candidate.id === station.bodyId);
  if (!body) throw new Error("Station references unknown body: " + station.bodyId);
  return [body.position[0] + station.offset[0], body.position[1] + station.offset[1]];
}
