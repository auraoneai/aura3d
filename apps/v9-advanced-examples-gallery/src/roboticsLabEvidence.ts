import { writeModelMatrix, type Vec3 } from "./math";
import { clampUnit, type EvidenceInstanceBatch, type EvidenceSingleItem, type RouteEvidencePayload } from "./advancedRouteEvidence";

export interface RoboticsLabEvidenceOptions {
  readonly time: number;
  readonly playing: boolean;
  readonly timeline: number;
  readonly skeleton: boolean;
  readonly follow: boolean;
  readonly selectedRobot?: string;
  readonly animationState?: string;
}

const CHARACTER_TASK_ZONES = [
  { name: "soldier run clip", x: -0.58, z: 0.04, height: 1.94 },
  { name: "primary robot dance clip", x: 0.9, z: 0.16, height: 1.42 },
  { name: "secondary robot handoff clip", x: 1.58, z: 0.96, height: 1.04 }
] as const;

export function createRoboticsLabEvidence(options: RoboticsLabEvidenceOptions): RouteEvidencePayload {
  const phase = options.playing ? options.time : clampUnit(options.timeline) * 12;
  const stateName = normalizeAnimationState(options.animationState);
  const selectedIndex = selectedActorIndex(options.selectedRobot ?? "");
  const selectedActor = CHARACTER_TASK_ZONES[selectedIndex]!;
  const batches: EvidenceInstanceBatch[] = [
    createSafetyZoneBatch(phase, stateName),
    createTaskZoneGroundingBatch(phase),
    createActorMotionTrailBatch(phase),
    createPoseDeltaBatch(phase),
    createSelectionBracketBatch(phase, selectedIndex),
    createFootContactBatch(phase, selectedIndex),
    createClipSwitchBatch(phase, stateName),
    createStatusPanelBatch(phase, stateName),
    createTimelineTickBatch(phase),
    createWorkcellStateBatch(phase, stateName),
    createCalibrationBeaconBatch(phase)
  ];
  if (options.skeleton) batches.push(createSkeletonEvidenceBatch(phase));
  if (options.follow) batches.push(createFollowCameraBatch(phase, selectedIndex));

  return {
    routeId: "robotics-lab",
    singles: [
      ...createTimelineScrubberEvidence(phase, stateName),
      ...createInspectionEvidence(phase, selectedIndex)
    ],
    batches,
    metrics: [
      `phase ${phase.toFixed(2)}s`,
      `${stateName} state`,
      `selected ${selectedActor.name}`,
      `${options.playing ? "playing" : "paused"}`,
      `${options.follow ? "follow camera on" : "follow camera off"}`,
      `${options.skeleton ? "skeleton overlay on" : "skeleton overlay off"}`,
      `${batches.reduce((sum, batch) => sum + batch.count, 0)} robotics evidence instances`
    ],
    animatedSystems: [
      "authored Soldier run clip",
      "authored Robot Expressive dance/walk clips",
      "selection bracket and pose-delta evidence",
      "timeline scrubber and keyed-state evidence",
      "clip switch state rail",
      "safety zone occupancy overlays",
      "foot contact grounding markers",
      "floor task-zone grounding evidence",
      "optional skeleton pose-path diagnostics",
      "camera follow target diagnostics",
      "clip status monitor banks",
      "selected robot inspection marker",
      "workcell calibration beacons"
    ],
    labels: ["Robots", "Timeline", "State", "Safety", "Skeleton guide", "Motion", "Selection"],
    approximations: [
      "Procedural robot arms and workcell overlays remain lab context around the imported animated Soldier and Robot Expressive GLB actors.",
      "Timeline, clip-state, safety, selection, and inspection evidence are rendered as route overlays and do not claim live robot telemetry.",
      "Follow-camera markers show route camera intent and selected-actor framing, not a full cinematic camera graph.",
      "Skeleton/path diagnostics are sampled pose guides only; this route does not claim IK solving, retargeting constraints, or foot-lock correction."
    ],
    unsupportedGaps: [
      "Full articulated robot dynamics are not connected in robotics-lab.",
      "Imported GLB clip selection and material fidelity still need route-specific review.",
      "No inverse-kinematics solver is connected; skeleton lines show approximate pose/path evidence only.",
      "Live telemetry/CAD import belongs to digital-twin scope and is not proven by this helper."
    ],
    integrationSteps: [
      "createRoboticsLabEvidence is imported by the robotics-lab scene builder.",
      "Append safety/path/status/timeline/selection batches with the existing instancedItem helper.",
      "Append timeline and inspection singles with item(...) so route state is visible in the camera.",
      "Keep candidate status until animation clips, grounding, and screenshot hashes are accepted."
    ]
  };
}

function createSafetyZoneBatch(time: number, stateName: string): EvidenceInstanceBatch {
  const count = CHARACTER_TASK_ZONES.length * 2;
  const transforms = new Float32Array(count * 16);
  const active = stateToZoneIndex(stateName);
  let cursor = 0;
  for (let zoneIndex = 0; zoneIndex < CHARACTER_TASK_ZONES.length; zoneIndex += 1) {
    const zone = CHARACTER_TASK_ZONES[zoneIndex]!;
    const pulse = 1 + Math.sin(time * 1.8 + zoneIndex * 0.8) * (zoneIndex === active ? 0.055 : 0.025);
    writeModelMatrix(transforms, cursor * 16, [zone.x, -0.536, zone.z], [1.04 * pulse, 0.016, 1.04 * pulse], [0, 0, 0]);
    cursor += 1;
    writeModelMatrix(transforms, cursor * 16, [zone.x, -0.516, zone.z], [1.22 * pulse, 0.012, 0.04], [0, time * 0.12 + zoneIndex * 0.22, 0]);
    cursor += 1;
  }
  return { geometry: "cube", material: "transparentAmber", label: "robotics safety zone evidence", transforms, count };
}

function createTaskZoneGroundingBatch(time: number): EvidenceInstanceBatch {
  const markersPerZone = 10;
  const count = CHARACTER_TASK_ZONES.length * markersPerZone;
  const transforms = new Float32Array(count * 16);
  let cursor = 0;
  for (let zoneIndex = 0; zoneIndex < CHARACTER_TASK_ZONES.length; zoneIndex += 1) {
    const zone = CHARACTER_TASK_ZONES[zoneIndex]!;
    for (let marker = 0; marker < markersPerZone; marker += 1) {
      const side = marker < markersPerZone / 2 ? -1 : 1;
      const slot = marker % 5;
      const pulse = 0.88 + Math.sin(time * 1.6 + zoneIndex * 0.7 + marker * 0.4) * 0.08;
      const x = zone.x - 0.4 + slot * 0.2;
      const z = zone.z + side * 0.43;
      writeModelMatrix(transforms, cursor * 16, [x, -0.525, z], [0.13 * pulse, 0.014, 0.034], [0, 0, 0]);
      cursor += 1;
    }
  }
  return { geometry: "cube", material: "transparentAmber", label: "robotics task-zone grounding evidence", transforms, count };
}

function createActorMotionTrailBatch(time: number): EvidenceInstanceBatch {
  const segmentsPerZone = 8;
  const count = CHARACTER_TASK_ZONES.length * segmentsPerZone;
  const transforms = new Float32Array(count * 16);
  let cursor = 0;
  for (let zoneIndex = 0; zoneIndex < CHARACTER_TASK_ZONES.length; zoneIndex += 1) {
    const zone = CHARACTER_TASK_ZONES[zoneIndex]!;
    for (let i = 0; i < segmentsPerZone; i += 1) {
      const u = i / segmentsPerZone;
      const phase = time * (0.12 + zoneIndex * 0.02) + u;
      const x = zone.x - 0.36 + u * 0.72;
      const z = zone.z + Math.sin((u + zoneIndex * 0.18) * Math.PI * 2) * 0.16;
      const y = -0.49 + Math.sin(phase * Math.PI * 2) * 0.006;
      writeModelMatrix(transforms, cursor * 16, [x, y, z], [0.18 + u * 0.1, 1, 1], [0, Math.PI / 2 + Math.sin(phase) * 0.24, 0]);
      cursor += 1;
    }
  }
  return { geometry: "lineX", material: "transparentCyan", label: "authored clip motion trail evidence", transforms, count };
}

function createPoseDeltaBatch(time: number): EvidenceInstanceBatch {
  const markersPerZone = 5;
  const count = CHARACTER_TASK_ZONES.length * markersPerZone;
  const transforms = new Float32Array(count * 16);
  let cursor = 0;
  for (let zoneIndex = 0; zoneIndex < CHARACTER_TASK_ZONES.length; zoneIndex += 1) {
    const zone = CHARACTER_TASK_ZONES[zoneIndex]!;
    for (let marker = 0; marker < markersPerZone; marker += 1) {
      const phase = time * (0.9 + marker * 0.08) + zoneIndex * 0.72 + marker * 0.5;
      const x = zone.x + Math.sin(phase) * (0.16 + marker * 0.026);
      const y = -0.38 + zone.height * (0.24 + marker * 0.12);
      const z = zone.z - 0.08 + Math.cos(phase * 1.2) * 0.12;
      const size = 0.035 + marker * 0.004;
      writeModelMatrix(transforms, cursor * 16, [x, y, z], [size, size, size], [0, 0, 0]);
      cursor += 1;
    }
  }
  return { geometry: "sphere", material: "cyanGlow", label: "authored pose delta evidence", transforms, count };
}

function createFootContactBatch(time: number, selectedIndex: number): EvidenceInstanceBatch {
  const count = CHARACTER_TASK_ZONES.length * 4;
  const transforms = new Float32Array(count * 16);
  let cursor = 0;
  for (let zoneIndex = 0; zoneIndex < CHARACTER_TASK_ZONES.length; zoneIndex += 1) {
    const zone = CHARACTER_TASK_ZONES[zoneIndex]!;
    for (let foot = 0; foot < 2; foot += 1) {
      const side = foot === 0 ? -1 : 1;
      const stride = Math.sin(time * (zoneIndex === 0 ? 5.2 : 3.4) + foot * Math.PI + zoneIndex * 0.7);
      const contact = Math.max(0.42, 1 - Math.abs(stride) * 0.52);
      const x = zone.x + side * 0.12 + Math.sin(time * 1.1 + zoneIndex) * 0.035;
      const z = zone.z + 0.18 + stride * 0.16;
      const materialScale = zoneIndex === selectedIndex ? 1.12 : 0.84;
      writeModelMatrix(transforms, cursor * 16, [x, -0.506, z], [0.18 * materialScale, 0.014, 0.08 * contact], [0, side * 0.18, 0]);
      cursor += 1;
      writeModelMatrix(transforms, cursor * 16, [x, -0.495, z + side * 0.035], [0.08 * contact, 0.012, 0.028], [0, side * 0.18, 0]);
      cursor += 1;
    }
  }
  return { geometry: "cube", material: "transparentGreen", label: "robotics foot contact grounding evidence", transforms, count };
}

function createClipSwitchBatch(time: number, stateName: string): EvidenceInstanceBatch {
  const states = ["idle", "training", "inspect", "handoff"] as const;
  const count = states.length * 3;
  const transforms = new Float32Array(count * 16);
  let cursor = 0;
  const active = Math.max(0, states.indexOf(stateName as typeof states[number]));
  for (let stateIndex = 0; stateIndex < states.length; stateIndex += 1) {
    const x = -1.22 + stateIndex * 0.46;
    const lit = stateIndex === active ? 1.2 + Math.sin(time * 4.2) * 0.08 : 0.68;
    writeModelMatrix(transforms, cursor * 16, [x, 0.72, -1.23], [0.34, 0.035 * lit, 0.03], [0, 0, 0]);
    cursor += 1;
    writeModelMatrix(transforms, cursor * 16, [x, 0.66, -1.23], [0.22, 0.022, 0.026], [0, 0, 0]);
    cursor += 1;
    writeModelMatrix(transforms, cursor * 16, [x, 0.6, -1.23], [0.12 + stateIndex * 0.026, 0.018, 0.026], [0, 0, 0]);
    cursor += 1;
  }
  return { geometry: "cube", material: "cyanGlow", label: "robotics clip switch state rail evidence", transforms, count };
}

function createSelectionBracketBatch(time: number, selectedIndex: number): EvidenceInstanceBatch {
  const zone = CHARACTER_TASK_ZONES[selectedIndex]!;
  const transforms = new Float32Array(4 * 16);
  const pulse = 1 + Math.sin(time * 2.2) * 0.045;
  const half = 0.58 * pulse;
  writeModelMatrix(transforms, 0, [zone.x, -0.49, zone.z - half], [0.88, 1, 1], [0, 0, 0]);
  writeModelMatrix(transforms, 16, [zone.x, -0.49, zone.z + half], [0.88, 1, 1], [0, 0, 0]);
  writeModelMatrix(transforms, 32, [zone.x - half, -0.49, zone.z], [0.88, 1, 1], [0, Math.PI / 2, 0]);
  writeModelMatrix(transforms, 48, [zone.x + half, -0.49, zone.z], [0.88, 1, 1], [0, Math.PI / 2, 0]);
  return { geometry: "lineX", material: "transparentAmber", label: "selected actor floor bracket evidence", transforms, count: 4 };
}

function createStatusPanelBatch(time: number, stateName: string): EvidenceInstanceBatch {
  const count = 15;
  const transforms = new Float32Array(count * 16);
  const active = stateToZoneIndex(stateName);
  for (let i = 0; i < count; i += 1) {
    const column = i % 5;
    const row = Math.floor(i / 5);
    const activeRow = row === active ? 1.18 : 0.74;
    const blink = activeRow + Math.sin(time * 2.4 + i * 0.8) * 0.1;
    const x = -2.12 + column * 0.27;
    const y = 0.25 + row * 0.14;
    const z = -1.33;
    writeModelMatrix(transforms, i * 16, [x, y, z], [0.12, 0.038 * blink, 0.024], [0, 0, 0]);
  }
  return { geometry: "cube", material: "greenGlow", label: "robotics clip status monitor evidence", transforms, count };
}

function createTimelineTickBatch(time: number): EvidenceInstanceBatch {
  const count = 12;
  const transforms = new Float32Array(count * 16);
  const active = Math.floor(((time % 12) / 12) * count);
  for (let i = 0; i < count; i += 1) {
    const x = -1.22 + i * 0.22;
    const lit = i <= active ? 1 : 0.62;
    writeModelMatrix(transforms, i * 16, [x, -0.575, 1.5], [0.03, 0.045 * lit, 0.1], [0, 0, 0]);
  }
  return { geometry: "cube", material: "cyanGlow", label: "robotics timeline keyed-state tick evidence", transforms, count };
}

function createWorkcellStateBatch(time: number, stateName: string): EvidenceInstanceBatch {
  const count = CHARACTER_TASK_ZONES.length * 5;
  const transforms = new Float32Array(count * 16);
  const active = stateToZoneIndex(stateName);
  let cursor = 0;
  for (let zoneIndex = 0; zoneIndex < CHARACTER_TASK_ZONES.length; zoneIndex += 1) {
    const zone = CHARACTER_TASK_ZONES[zoneIndex]!;
    for (let slot = 0; slot < 5; slot += 1) {
      const pulse = (zoneIndex === active ? 0.9 : 0.56) + Math.sin(time * 1.7 + cursor * 0.6) * 0.14;
      const x = zone.x - 0.34 + slot * 0.17;
      writeModelMatrix(transforms, cursor * 16, [x, 1.05 + slot * 0.018, zone.z - 0.56], [0.075, 0.044 * pulse, 0.026], [0, 0, 0]);
      cursor += 1;
    }
  }
  return { geometry: "cube", material: "amberGlow", label: "workcell clip-state gate evidence", transforms, count };
}

function createCalibrationBeaconBatch(time: number): EvidenceInstanceBatch {
  const count = 9;
  const transforms = new Float32Array(count * 16);
  for (let i = 0; i < count; i += 1) {
    const cell = i % 3;
    const tier = Math.floor(i / 3);
    const zone = CHARACTER_TASK_ZONES[cell]!;
    const x = zone.x - 0.24 + tier * 0.24;
    const y = 0.38 + tier * 0.28 + Math.sin(time * 1.45 + i) * 0.02;
    const z = zone.z - 0.52;
    writeModelMatrix(transforms, i * 16, [x, y, z], [0.047, 0.047, 0.047], [0, 0, 0]);
  }
  return { geometry: "sphere", material: "cyanGlow", label: "workcell calibration beacon evidence", transforms, count };
}

function createSkeletonEvidenceBatch(time: number): EvidenceInstanceBatch {
  const count = 54;
  const transforms = new Float32Array(count * 16);
  for (let i = 0; i < count; i += 1) {
    const robot = Math.floor(i / 18);
    const bone = i % 18;
    const zone = CHARACTER_TASK_ZONES[robot]!;
    const chain = Math.floor(bone / 6);
    const joint = bone % 6;
    const phase = time * (0.9 + chain * 0.13) + joint * 0.42 + robot * 0.7;
    const x = zone.x + (chain - 1) * 0.13 + Math.sin(phase) * (0.12 + joint * 0.01);
    const y = -0.28 + zone.height * (0.16 + joint * 0.105);
    const z = zone.z + Math.cos(phase * 1.15) * (0.12 + chain * 0.025);
    writeModelMatrix(transforms, i * 16, [x, y, z], [0.16 + joint * 0.018, 1, 1], [0, phase * 0.18, chain * 0.38]);
  }
  return { geometry: "lineX", material: "wire", label: "skeleton pose guide evidence no IK", transforms, count };
}

function createFollowCameraBatch(time: number, selectedIndex: number): EvidenceInstanceBatch {
  const zone = CHARACTER_TASK_ZONES[selectedIndex]!;
  const count = 7;
  const transforms = new Float32Array(count * 16);
  const pulse = 1 + Math.sin(time * 2.4) * 0.06;
  writeModelMatrix(transforms, 0, [zone.x - 0.54, 1.2, zone.z + 0.78], [0.24 * pulse, 0.18, 0.04], [0.18, -0.55, 0.08]);
  writeModelMatrix(transforms, 16, [zone.x - 0.36, 1.05, zone.z + 0.55], [0.38, 1, 1], [0, -0.78, -0.2]);
  writeModelMatrix(transforms, 32, [zone.x - 0.18, 0.9, zone.z + 0.32], [0.32, 1, 1], [0, -0.74, -0.16]);
  writeModelMatrix(transforms, 48, [zone.x, 0.74, zone.z + 0.1], [0.28, 1, 1], [0, -0.68, -0.12]);
  writeModelMatrix(transforms, 64, [zone.x - 0.66, 1.18, zone.z + 0.72], [0.04, 0.22, 0.04], [0, 0, 0]);
  writeModelMatrix(transforms, 80, [zone.x - 0.44, 1.18, zone.z + 0.72], [0.04, 0.22, 0.04], [0, 0, 0]);
  writeModelMatrix(transforms, 96, [zone.x - 0.55, 1.3, zone.z + 0.72], [0.25, 0.04, 0.04], [0, 0, 0]);
  return { geometry: "lineX", material: "transparentAmber", label: "robotics follow camera target evidence", transforms, count };
}

function createTimelineScrubberEvidence(time: number, stateName: string): EvidenceSingleItem[] {
  const progress = (time % 12) / 12;
  const active = stateToZoneIndex(stateName);
  return [
    {
      geometry: "cube",
      material: "darkSteel",
      label: "timeline rail",
      position: [0, -0.59, 1.5],
      scale: [2.72, 0.026, 0.036],
      rotation: [0, 0, 0]
    },
    {
      geometry: "cube",
      material: "cyanGlow",
      label: "timeline playhead",
      position: [-1.36 + progress * 2.72, -0.548, 1.5],
      scale: [0.085, 0.055, 0.07],
      rotation: [0, 0, 0]
    },
    {
      geometry: "cube",
      material: "amberGlow",
      label: "active animation state token",
      position: [1.52, -0.55, 1.34 + active * 0.11],
      scale: [0.12, 0.052, 0.052],
      rotation: [0, time * 0.24, 0]
    }
  ];
}

function createInspectionEvidence(time: number, selectedIndex: number): EvidenceSingleItem[] {
  const zone = CHARACTER_TASK_ZONES[selectedIndex]!;
  const origin: Vec3 = [zone.x, -0.38 + zone.height * 0.86 + Math.sin(time * 1.6) * 0.055, zone.z - 0.18];
  return [
    {
      geometry: "sphere",
      material: "amberGlow",
      label: "selected robot inspection marker",
      position: origin,
      scale: [0.072, 0.072, 0.072],
      rotation: [0, 0, 0]
    },
    {
      geometry: "lineX",
      material: "transparentAmber",
      label: "selected robot inspection tether",
      position: [origin[0], origin[1] - 0.28, origin[2] + 0.08],
      scale: [0.5, 1, 1],
      rotation: [0, time * 0.12, 0.34]
    }
  ];
}

function normalizeAnimationState(value: string | undefined): string {
  if (value === "idle" || value === "inspect" || value === "handoff") return value;
  return "training";
}

function stateToZoneIndex(stateName: string): number {
  if (stateName === "handoff") return 2;
  if (stateName === "inspect") return 1;
  return 0;
}

function selectedActorIndex(selectedRobot: string): number {
  const normalized = selectedRobot.toLowerCase();
  if (normalized.includes("secondary") || normalized.includes("operator") || normalized.includes("handoff") || normalized.includes("3")) return 2;
  if (normalized.includes("expressive") || normalized.includes("dance") || normalized.includes("primary") || normalized.includes("2")) return 1;
  return 0;
}
