/**
 * Inverse Kinematics (IK) solvers for procedural animation.
 * Provides analytical and iterative IK solutions for various use cases.
 * @module animation/IK
 */

export { TwoBoneIKSolver } from './TwoBoneIKSolver';
export type { TwoBoneIKConfig } from './TwoBoneIKSolver';
export {
  FABRIKSolver,
  JointConstraintType
} from './FABRIKSolver';
export type {
  FABRIKConfig,
  JointConstraint
} from './FABRIKSolver';
export { CCDSolver } from './CCDSolver';
export type { CCDConfig, JointLimit } from './CCDSolver';
export {
  FullBodyIKSolver
} from './FullBodyIKSolver';
export type {
  FullBodyIKConfig,
  IKTarget
} from './FullBodyIKSolver';
