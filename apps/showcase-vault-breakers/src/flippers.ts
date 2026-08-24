/**
 * Vault Breakers flipper controller (PRD VB-05).
 *
 * Maps input edges onto the motorised-hinge rigs built by table.ts. Mode is
 * "joint": both flippers raise with the SAME positive motor speed (the VB-01
 * spike's axis-mirror workaround for the vendored-Rapier opposite-sign motor
 * defect — see ../SPIKE-FLIPPER.md). The kinematic fallback stays documented
 * in the PRD but is not used.
 */
import type { FlipperRig } from "./table";
import { FLIPPER_UP_YAW, RIGHT_UP_YAW } from "./table";

export type FlipperMode = "joint";

export interface FlipperInputState {
  readonly leftHeld: boolean;
  readonly rightHeld: boolean;
}

export interface FlipperSnapshot {
  readonly mode: FlipperMode;
  readonly leftRaised: boolean;
  readonly rightRaised: boolean;
  readonly activationCount: number;
}

export class FlipperController {
  private readonly rigs: { readonly left: FlipperRig; readonly right: FlipperRig };
  private leftHeldValue = false;
  private rightHeldValue = false;
  private activationCountValue = 0;
  private locked = false;

  constructor(rigs: { readonly left: FlipperRig; readonly right: FlipperRig }) {
    this.rigs = rigs;
  }

  get mode(): FlipperMode {
    return "joint";
  }

  get activationCount(): number {
    return this.activationCountValue;
  }

  /** Tilt lockout: flippers release and ignore input until cleared. */
  setLocked(locked: boolean): void {
    this.locked = locked;
    if (locked) {
      this.rigs.left.release();
      this.rigs.right.release();
      this.leftHeldValue = false;
      this.rightHeldValue = false;
    }
  }

  update(input: FlipperInputState): void {
    if (this.locked) {
      this.rigs.left.release();
      this.rigs.right.release();
      return;
    }
    if (input.leftHeld !== this.leftHeldValue) {
      this.leftHeldValue = input.leftHeld;
      if (input.leftHeld) {
        this.rigs.left.raise();
        this.activationCountValue += 1;
      } else {
        this.rigs.left.release();
      }
    }
    if (input.rightHeld !== this.rightHeldValue) {
      this.rightHeldValue = input.rightHeld;
      if (input.rightHeld) {
        this.rigs.right.raise();
        this.activationCountValue += 1;
      } else {
        this.rigs.right.release();
      }
    }
  }

  releaseAll(): void {
    this.update({ leftHeld: false, rightHeld: false });
  }

  snapshot(): FlipperSnapshot {
    return {
      mode: this.mode,
      leftRaised: this.rigs.left.yaw() > FLIPPER_UP_YAW - 0.15,
      rightRaised: this.rigs.right.yaw() < RIGHT_UP_YAW + 0.15,
      activationCount: this.activationCountValue
    };
  }
}
