/**
 * Gravity Post — station nodes + dock sensor specs.
 *
 * Stations are typed GLB ring props (assets.gravityPostStationRing) with a
 * pulsing emissive capture-window ring and ONE static physics sensor body per
 * station. The pod (kinematic body) overlaps sensors; the route listens to
 * app.physics.onTriggerEnter for real trigger-driven captures.
 */
import { STATIONS, stationPosition } from "./contracts";
import { DOCK_SENSOR_RADIUS } from "./pod";

export interface StationWorld {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly z: number;
  readonly dockRadius: number;
  /** Runtime node ids owned by the station. */
  readonly nodeId: string;
  readonly pulseNodeId: string;
  /** Physics sensor body name registered with app.physics. */
  readonly sensorBodyName: string;
}

export function buildStations(): StationWorld[] {
  return STATIONS.map((station) => {
    const position = stationPosition(station);
    return {
      id: station.id,
      name: station.name,
      x: position[0],
      z: position[1],
      dockRadius: DOCK_SENSOR_RADIUS,
      nodeId: "station-" + station.id,
      pulseNodeId: "station-pulse-" + station.id,
      sensorBodyName: "dock-sensor-" + station.id
    };
  });
}

/** Physics body spec for one dock sensor (static, sphere, sensor). */
export function dockSensorBodySpec(station: StationWorld): {
  readonly name: string;
  readonly type: "static";
  readonly shape: "sphere";
  readonly radius: number;
  readonly position: readonly [number, number, number];
  readonly sensor: true;
} {
  return {
    name: station.sensorBodyName,
    type: "static",
    shape: "sphere",
    radius: station.dockRadius,
    position: [station.x, PLAY_PLANE_Y, station.z],
    sensor: true
  };
}

/** The play plane height shared by gameplay bodies and stations. */
export const PLAY_PLANE_Y = 0.14;

/** Pod physics body spec (dynamic, velocity-driven by the authored integrator). */
export const POD_BODY_SPEC = {
  name: "mail-pod-body",
  type: "dynamic" as const,
  shape: "sphere" as const,
  radius: 0.075,
  mass: 0.2
};

export function stationByIdOrThrow(stations: readonly StationWorld[], id: string): StationWorld {
  const station = stations.find((candidate) => candidate.id === id);
  if (!station) throw new Error("Unknown station world id: " + id);
  return station;
}
