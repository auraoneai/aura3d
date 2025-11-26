/**
 * @fileoverview Formation movement patterns for group coordination.
 * @module ai/steering/Formation
 */

import { Vector3 } from '../../math/Vector3';
import { SteeringBehavior } from './SteeringBehavior';

/**
 * Formation type enumeration.
 */
export enum FormationType {
  /** Line formation - agents in a straight line */
  LINE = 'line',
  /** Circle formation - agents arranged in a circle */
  CIRCLE = 'circle',
  /** Wedge/V formation - agents in a V shape */
  WEDGE = 'wedge',
  /** Column formation - agents in a column behind leader */
  COLUMN = 'column',
  /** Custom formation - user-defined slot positions */
  CUSTOM = 'custom',
}

/**
 * Formation slot representing an agent's position in the formation.
 */
export interface FormationSlot {
  /** Slot index */
  index: number;
  /** Relative offset from formation center */
  offset: Vector3;
}

/**
 * Formation behavior maintains agents in organized patterns.
 * Supports common formations (line, circle, wedge) and custom patterns.
 *
 * @example
 * ```typescript
 * // Circle formation
 * const formation = new Formation(FormationType.CIRCLE, {
 *   slotCount: 8,
 *   spacing: 5
 * });
 *
 * // Assign slot to agent
 * const mySlot = formation.getSlot(2);
 *
 * // In update loop
 * const leaderPos = leader.position;
 * const leaderDir = leader.forward;
 * const force = formation.calculate(agentPos, agentVel, maxSpeed, leaderPos, leaderDir, mySlot);
 * agentVel.addInPlace(force.scale(deltaTime));
 * ```
 */
export class Formation extends SteeringBehavior {
  /** Formation type */
  type: FormationType;

  /** Number of slots in formation */
  slotCount: number;

  /** Spacing between slots */
  spacing: number;

  /** Formation slots */
  private slots: FormationSlot[];

  /** Custom slot offsets (for CUSTOM type) */
  private customOffsets: Vector3[];

  /** Arrival tolerance */
  tolerance: number;

  /** Slowing radius for arrival */
  slowingRadius: number;

  /**
   * Creates a new formation behavior.
   *
   * @param type - Formation type
   * @param options - Optional configuration
   */
  constructor(
    type: FormationType = FormationType.LINE,
    options: {
      slotCount?: number;
      spacing?: number;
      customOffsets?: Vector3[];
      tolerance?: number;
      slowingRadius?: number;
      weight?: number;
      priority?: number;
      enabled?: boolean;
    } = {}
  ) {
    super({ ...options, name: 'Formation' });
    this.type = type;
    this.slotCount = options.slotCount ?? 4;
    this.spacing = options.spacing ?? 5.0;
    this.customOffsets = options.customOffsets ?? [];
    this.tolerance = options.tolerance ?? 0.5;
    this.slowingRadius = options.slowingRadius ?? 3.0;

    this.slots = [];
    this.generateSlots();
  }

  /**
   * Generates formation slots based on type.
   * @private
   */
  private generateSlots(): void {
    this.slots = [];

    switch (this.type) {
      case FormationType.LINE:
        this.generateLineFormation();
        break;
      case FormationType.CIRCLE:
        this.generateCircleFormation();
        break;
      case FormationType.WEDGE:
        this.generateWedgeFormation();
        break;
      case FormationType.COLUMN:
        this.generateColumnFormation();
        break;
      case FormationType.CUSTOM:
        this.generateCustomFormation();
        break;
    }
  }

  /**
   * Generates line formation slots.
   * @private
   */
  private generateLineFormation(): void {
    for (let i = 0; i < this.slotCount; i++) {
      const offset = (i - (this.slotCount - 1) / 2) * this.spacing;
      this.slots.push({
        index: i,
        offset: new Vector3(offset, 0, 0),
      });
    }
  }

  /**
   * Generates circle formation slots.
   * @private
   */
  private generateCircleFormation(): void {
    const angleStep = (Math.PI * 2) / this.slotCount;
    for (let i = 0; i < this.slotCount; i++) {
      const angle = i * angleStep;
      const x = Math.cos(angle) * this.spacing;
      const z = Math.sin(angle) * this.spacing;
      this.slots.push({
        index: i,
        offset: new Vector3(x, 0, z),
      });
    }
  }

  /**
   * Generates wedge/V formation slots.
   * @private
   */
  private generateWedgeFormation(): void {
    // Leader at front
    this.slots.push({
      index: 0,
      offset: new Vector3(0, 0, 0),
    });

    // Wings on either side, behind leader
    for (let i = 1; i < this.slotCount; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const row = Math.floor(i / 2);
      const x = side * (row + 1) * this.spacing;
      const z = -(row + 1) * this.spacing;
      this.slots.push({
        index: i,
        offset: new Vector3(x, 0, z),
      });
    }
  }

  /**
   * Generates column formation slots.
   * @private
   */
  private generateColumnFormation(): void {
    for (let i = 0; i < this.slotCount; i++) {
      this.slots.push({
        index: i,
        offset: new Vector3(0, 0, -i * this.spacing),
      });
    }
  }

  /**
   * Generates custom formation slots.
   * @private
   */
  private generateCustomFormation(): void {
    for (let i = 0; i < this.customOffsets.length; i++) {
      this.slots.push({
        index: i,
        offset: this.customOffsets[i].clone(),
      });
    }
  }

  /**
   * Calculates the formation steering force.
   *
   * @param position - Current agent position
   * @param velocity - Current agent velocity
   * @param maxSpeed - Maximum agent speed
   * @param formationCenter - Formation center position (leader position)
   * @param formationDirection - Formation forward direction
   * @param slot - Agent's assigned slot
   * @returns Steering force vector
   */
  calculate(
    position: Vector3,
    velocity: Vector3,
    maxSpeed: number,
    formationCenter: Vector3 = Vector3.zero(),
    formationDirection: Vector3 = Vector3.forward(),
    slot: FormationSlot | null = null
  ): Vector3 {
    if (!slot) {
      return Vector3.zero();
    }

    // Calculate world space slot position
    const slotPosition = this.getSlotWorldPosition(
      formationCenter,
      formationDirection,
      slot
    );

    // Use arrival behavior toward slot
    const toSlot = slotPosition.sub(position);
    const distance = toSlot.length();

    if (distance < this.tolerance) {
      return velocity.negate(); // Stop
    }

    let desiredSpeed: number;
    if (distance > this.slowingRadius) {
      desiredSpeed = maxSpeed;
    } else {
      desiredSpeed = maxSpeed * (distance / this.slowingRadius);
    }

    const desired = toSlot.normalize().scale(desiredSpeed);
    return desired.sub(velocity);
  }

  /**
   * Gets a slot by index.
   *
   * @param index - Slot index
   * @returns Formation slot or null
   */
  getSlot(index: number): FormationSlot | null {
    return this.slots[index] || null;
  }

  /**
   * Gets all slots.
   *
   * @returns Array of all slots
   */
  getAllSlots(): FormationSlot[] {
    return [...this.slots];
  }

  /**
   * Gets the number of slots.
   */
  getSlotCount(): number {
    return this.slots.length;
  }

  /**
   * Gets a slot's world position.
   *
   * @param formationCenter - Formation center position
   * @param formationDirection - Formation forward direction
   * @param slot - Formation slot
   * @returns World position of slot
   */
  getSlotWorldPosition(
    formationCenter: Vector3,
    formationDirection: Vector3,
    slot: FormationSlot
  ): Vector3 {
    // Create local-to-world transform
    const forward = formationDirection.normalize();
    const right = Vector3.up().cross(forward).normalize();
    const up = forward.cross(right);

    // Transform slot offset to world space
    const worldOffset = Vector3.zero();
    worldOffset.addInPlace(right.scale(slot.offset.x));
    worldOffset.addInPlace(up.scale(slot.offset.y));
    worldOffset.addInPlace(forward.scale(slot.offset.z));

    return formationCenter.add(worldOffset);
  }

  /**
   * Sets custom slot offsets for CUSTOM formation type.
   *
   * @param offsets - Array of offset vectors
   */
  setCustomOffsets(offsets: Vector3[]): void {
    this.customOffsets = offsets.map((o) => o.clone());
    if (this.type === FormationType.CUSTOM) {
      this.generateSlots();
    }
  }

  /**
   * Changes the formation type and regenerates slots.
   *
   * @param type - New formation type
   */
  setFormationType(type: FormationType): void {
    this.type = type;
    this.generateSlots();
  }

  /**
   * Sets the number of slots and regenerates formation.
   *
   * @param count - New slot count
   */
  setSlotCount(count: number): void {
    this.slotCount = count;
    this.generateSlots();
  }
}
