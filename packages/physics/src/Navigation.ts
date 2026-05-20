export type NavigationCell = readonly [number, number];
export type NavigationPoint = readonly [number, number];

export type NavigationPathStatus = "success" | "partial" | "failed";

export interface NavigationPath {
  readonly status: NavigationPathStatus;
  readonly cells: readonly NavigationCell[];
  readonly waypoints: readonly NavigationPoint[];
  readonly length: number;
  readonly cost: number;
  readonly visitedCells: number;
}

export interface NavigationGridOptions {
  readonly width: number;
  readonly height: number;
  readonly origin?: NavigationPoint;
  readonly cellSize?: number;
  readonly blocked?: readonly NavigationCell[];
  readonly costs?: readonly { readonly cell: NavigationCell; readonly cost: number }[];
  readonly allowDiagonal?: boolean;
}

export interface NavigationAgentOptions {
  readonly position: NavigationPoint;
  readonly speed?: number;
  readonly waypointRadius?: number;
}

export interface NavigationAgentSnapshot {
  readonly position: NavigationPoint;
  readonly state: "idle" | "moving" | "arrived" | "blocked";
  readonly waypointIndex: number;
  readonly remainingWaypoints: number;
  readonly pathLength: number;
  readonly distanceTraveled: number;
}

type SearchNode = {
  readonly cell: NavigationCell;
  readonly key: string;
  readonly parent?: SearchNode;
  readonly g: number;
  readonly h: number;
  readonly f: number;
};

export class NavigationGrid {
  public readonly width: number;
  public readonly height: number;
  public readonly origin: NavigationPoint;
  public readonly cellSize: number;
  public readonly allowDiagonal: boolean;
  private readonly blocked = new Set<string>();
  private readonly costs = new Map<string, number>();

  constructor(options: NavigationGridOptions) {
    if (!Number.isInteger(options.width) || options.width < 2 || !Number.isInteger(options.height) || options.height < 2) {
      throw new RangeError("NavigationGrid width and height must be integers >= 2.");
    }
    this.width = options.width;
    this.height = options.height;
    this.origin = options.origin ?? [0, 0];
    this.cellSize = options.cellSize ?? 1;
    this.allowDiagonal = options.allowDiagonal ?? false;
    if (!Number.isFinite(this.cellSize) || this.cellSize <= 0) {
      throw new RangeError("NavigationGrid cellSize must be a finite positive number.");
    }
    for (const cell of options.blocked ?? []) {
      if (this.containsCell(cell)) this.blocked.add(cellKey(cell));
    }
    for (const entry of options.costs ?? []) {
      if (!this.containsCell(entry.cell)) continue;
      if (!Number.isFinite(entry.cost) || entry.cost <= 0) {
        throw new RangeError("NavigationGrid traversal costs must be finite positive numbers.");
      }
      this.costs.set(cellKey(entry.cell), entry.cost);
    }
  }

  isBlocked(cell: NavigationCell): boolean {
    return this.blocked.has(cellKey(cell));
  }

  cellCost(cell: NavigationCell): number {
    return this.costs.get(cellKey(cell)) ?? 1;
  }

  containsCell(cell: NavigationCell): boolean {
    return Number.isInteger(cell[0]) && Number.isInteger(cell[1]) && cell[0] >= 0 && cell[1] >= 0 && cell[0] < this.width && cell[1] < this.height;
  }

  worldToCell(point: NavigationPoint): NavigationCell {
    return [
      clampInt(Math.floor((point[0] - this.origin[0]) / this.cellSize), 0, this.width - 1),
      clampInt(Math.floor((point[1] - this.origin[1]) / this.cellSize), 0, this.height - 1),
    ];
  }

  cellToWorld(cell: NavigationCell): NavigationPoint {
    return [
      this.origin[0] + (cell[0] + 0.5) * this.cellSize,
      this.origin[1] + (cell[1] + 0.5) * this.cellSize,
    ];
  }

  findPath(start: NavigationPoint, goal: NavigationPoint): NavigationPath {
    const startCell = this.nearestWalkableCell(this.worldToCell(start));
    const goalCell = this.nearestWalkableCell(this.worldToCell(goal));
    if (!startCell || !goalCell) return failedPath();
    const result = this.search(startCell, goalCell);
    if (!result) return failedPath();
    const cells = reconstruct(result.node);
    const waypoints = simplifyPath(cells).map((cell) => this.cellToWorld(cell));
    const lastWaypoint = result.complete ? goal : this.cellToWorld(cells[cells.length - 1]!);
    const normalizedWaypoints = [
      start,
      ...waypoints.slice(1, -1),
      lastWaypoint
    ];
    return {
      status: result.complete ? "success" : "partial",
      cells,
      waypoints: normalizedWaypoints,
      length: pathLength(normalizedWaypoints),
      cost: round3(result.node.g),
      visitedCells: result.visitedCells,
    };
  }

  private search(startCell: NavigationCell, goalCell: NavigationCell): { readonly node: SearchNode; readonly complete: boolean; readonly visitedCells: number } | undefined {
    const open: SearchNode[] = [node(startCell, undefined, 0, manhattan(startCell, goalCell))];
    const bestByCell = new Map<string, SearchNode>([[cellKey(startCell), open[0]!]]);
    const closed = new Set<string>();
    let best = open[0];

    while (open.length > 0) {
      open.sort((left, right) => left.f - right.f || left.h - right.h);
      const current = open.shift()!;
      if (closed.has(current.key)) continue;
      closed.add(current.key);
      if (current.h < best.h) best = current;
      if (sameCell(current.cell, goalCell)) {
        return { node: current, complete: true, visitedCells: closed.size };
      }
      for (const nextCell of neighbors(current.cell, this.allowDiagonal)) {
        if (!this.containsCell(nextCell) || this.isBlocked(nextCell)) continue;
        const key = cellKey(nextCell);
        if (closed.has(key)) continue;
        const stepCost = current.cell[0] !== nextCell[0] && current.cell[1] !== nextCell[1] ? Math.SQRT2 : 1;
        const g = current.g + stepCost * this.cellCost(nextCell);
        const h = heuristic(nextCell, goalCell, this.allowDiagonal);
        const existing = bestByCell.get(key);
        if (existing && existing.g <= g) continue;
        const next = node(nextCell, current, g, h);
        bestByCell.set(key, next);
        open.push(next);
      }
    }

    return best ? { node: best, complete: false, visitedCells: closed.size } : undefined;
  }

  private nearestWalkableCell(cell: NavigationCell): NavigationCell | undefined {
    if (this.containsCell(cell) && !this.isBlocked(cell)) return cell;
    for (let radius = 1; radius < Math.max(this.width, this.height); radius += 1) {
      for (let y = cell[1] - radius; y <= cell[1] + radius; y += 1) {
        for (let x = cell[0] - radius; x <= cell[0] + radius; x += 1) {
          const candidate = [x, y] as const;
          if (this.containsCell(candidate) && !this.isBlocked(candidate)) return candidate;
        }
      }
    }
    return undefined;
  }
}

export class NavigationAgent {
  private position: NavigationPoint;
  private path: NavigationPath = failedPath();
  private waypointIndex = 0;
  private distanceTraveled = 0;
  private readonly speed: number;
  private readonly waypointRadius: number;

  constructor(options: NavigationAgentOptions) {
    this.position = options.position;
    this.speed = options.speed ?? 1;
    this.waypointRadius = options.waypointRadius ?? 0.05;
    if (!Number.isFinite(this.speed) || this.speed <= 0 || !Number.isFinite(this.waypointRadius) || this.waypointRadius < 0) {
      throw new RangeError("NavigationAgent speed must be positive and waypointRadius must be non-negative.");
    }
  }

  setPath(path: NavigationPath): void {
    this.path = path;
    this.waypointIndex = path.waypoints.length > 1 ? 1 : 0;
    this.distanceTraveled = 0;
  }

  update(deltaSeconds: number): NavigationAgentSnapshot {
    if (this.path.status === "failed") return this.snapshot("blocked");
    if (this.waypointIndex >= this.path.waypoints.length) return this.snapshot("arrived");
    const target = this.path.waypoints[this.waypointIndex]!;
    const dx = target[0] - this.position[0];
    const dy = target[1] - this.position[1];
    const distance = Math.hypot(dx, dy);
    if (distance <= this.waypointRadius) {
      this.position = target;
      this.waypointIndex += 1;
      return this.update(deltaSeconds);
    }
    const step = Math.min(distance, Math.max(0, deltaSeconds) * this.speed);
    if (step >= distance) {
      this.position = target;
      this.distanceTraveled += distance;
      this.waypointIndex += 1;
      return this.snapshot("moving");
    }
    this.position = [
      this.position[0] + (dx / distance) * step,
      this.position[1] + (dy / distance) * step,
    ];
    this.distanceTraveled += step;
    return this.snapshot("moving");
  }

  snapshot(state: NavigationAgentSnapshot["state"] = this.path.status === "failed" ? "blocked" : "idle"): NavigationAgentSnapshot {
    const resolvedState = this.path.status === "failed" ? "blocked" : this.waypointIndex >= this.path.waypoints.length ? "arrived" : state;
    return {
      position: [round3(this.position[0]), round3(this.position[1])],
      state: resolvedState,
      waypointIndex: this.waypointIndex,
      remainingWaypoints: Math.max(0, this.path.waypoints.length - this.waypointIndex),
      pathLength: round3(this.path.length),
      distanceTraveled: round3(this.distanceTraveled),
    };
  }
}

function node(cell: NavigationCell, parent: SearchNode | undefined, g: number, h: number): SearchNode {
  return { cell, key: cellKey(cell), parent, g, h, f: g + h };
}

function neighbors(cell: NavigationCell, allowDiagonal: boolean): readonly NavigationCell[] {
  const cardinal: NavigationCell[] = [[cell[0] + 1, cell[1]], [cell[0] - 1, cell[1]], [cell[0], cell[1] + 1], [cell[0], cell[1] - 1]];
  return allowDiagonal
    ? [
        ...cardinal,
        [cell[0] + 1, cell[1] + 1],
        [cell[0] + 1, cell[1] - 1],
        [cell[0] - 1, cell[1] + 1],
        [cell[0] - 1, cell[1] - 1],
      ]
    : cardinal;
}

function reconstruct(node: SearchNode): readonly NavigationCell[] {
  const cells: NavigationCell[] = [];
  let current: SearchNode | undefined = node;
  while (current) {
    cells.push(current.cell);
    current = current.parent;
  }
  return cells.reverse();
}

function simplifyPath(cells: readonly NavigationCell[]): readonly NavigationCell[] {
  if (cells.length <= 2) return cells;
  const result: NavigationCell[] = [cells[0]!];
  let previousDirection: NavigationCell = [cells[1]![0] - cells[0]![0], cells[1]![1] - cells[0]![1]];
  for (let index = 2; index < cells.length; index += 1) {
    const direction: NavigationCell = [cells[index]![0] - cells[index - 1]![0], cells[index]![1] - cells[index - 1]![1]];
    if (!sameCell(direction, previousDirection)) {
      result.push(cells[index - 1]!);
      previousDirection = direction;
    }
  }
  result.push(cells[cells.length - 1]!);
  return result;
}

function failedPath(): NavigationPath {
  return { status: "failed", cells: [], waypoints: [], length: 0, cost: 0, visitedCells: 0 };
}

function pathLength(points: readonly NavigationPoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index]![0] - points[index - 1]![0], points[index]![1] - points[index - 1]![1]);
  }
  return round3(length);
}

function cellKey(cell: NavigationCell): string {
  return `${cell[0]}:${cell[1]}`;
}

function sameCell(left: NavigationCell, right: NavigationCell): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function manhattan(left: NavigationCell, right: NavigationCell): number {
  return Math.abs(left[0] - right[0]) + Math.abs(left[1] - right[1]);
}

function heuristic(left: NavigationCell, right: NavigationCell, allowDiagonal: boolean): number {
  if (!allowDiagonal) return manhattan(left, right);
  const dx = Math.abs(left[0] - right[0]);
  const dy = Math.abs(left[1] - right[1]);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}
