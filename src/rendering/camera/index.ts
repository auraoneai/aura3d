/**
 * Camera module providing camera, controller, and rig functionality.
 * @module camera
 */

export { Camera, ProjectionType } from './Camera';
export {
  OrbitCameraController,
  FirstPersonCameraController,
  FlyCameraController
} from './CameraController';
export type {
  ICameraController
} from './CameraController';
export { CameraRig, StereoEye } from './CameraRig';
export type { CameraConfig } from './CameraRig';
