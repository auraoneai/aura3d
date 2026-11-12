// Canonical 24-joint golfer bind pose: world position (metres) and world rotation (x, y, z, w)
// per joint, parent joint name, in hierarchy order. The Armature node scales its children by 0.01 (cm bone units).

export interface GolferBindJoint {
  readonly name: string;
  readonly parent: string | null;
  readonly pos: readonly [number, number, number];
  readonly rot: readonly [number, number, number, number];
}

export const GOLFER_ARMATURE_SCALE = 0.01;
export const GOLFER_GLB = "procedural-golfer-rig";

export const GOLFER_BIND: readonly GolferBindJoint[] = [
  { name: "Hips", parent: null, pos: [-0.003926, 1.057634, -0.032777], rot: [-0.038633, -0.00268, -0.00268, 0.999246] },
  { name: "Spine02", parent: "Hips", pos: [-0.003278, 1.173723, -0.041765], rot: [-0.038633, -0.00268, -0.00268, 0.999246] },
  { name: "Spine01", parent: "Spine02", pos: [-0.00263, 1.289813, -0.050753], rot: [-0.038633, -0.00268, -0.00268, 0.999246] },
  { name: "Spine", parent: "Spine01", pos: [-0.001963, 1.40942, -0.060014], rot: [-0.038661, -0.006254, -0.006254, 0.999213] },
  { name: "neck", parent: "Spine", pos: [-0.000948, 1.487385, -0.06605], rot: [-0.038661, -0.006254, -0.006254, 0.999213] },
  { name: "Head", parent: "neck", pos: [0, 1.560185, -0.071687], rot: [0.069212, -0.044289, -0.044289, 0.995634] },
  { name: "head_end", parent: "Head", pos: [0.02002, 1.800854, -0.037107], rot: [0.069212, -0.044289, -0.044289, 0.995634] },
  { name: "headfront", parent: "Head", pos: [0, 1.560185, 0.050049], rot: [0, -0.707107, -0.707107, 0] },
  { name: "LeftShoulder", parent: "Spine", pos: [0.039291, 1.459698, -0.063879], rot: [-0.505392, -0.494346, -0.494549, 0.50559] },
  { name: "LeftArm", parent: "LeftShoulder", pos: [0.200246, 1.459698, -0.067434], rot: [0.028478, -0.002661, -0.848098, 0.529066] },
  { name: "LeftForeArm", parent: "LeftArm", pos: [0.408346, 1.35761, -0.059399], rot: [0.160913, 0.126833, -0.747525, 0.631844] },
  { name: "LeftHand", parent: "LeftForeArm", pos: [0.659636, 1.31442, -0.0559], rot: [0.153144, 0.20854, -0.734697, 0.627119] },
  { name: "RightShoulder", parent: "Spine", pos: [-0.040807, 1.463624, -0.064238], rot: [-0.504743, 0.495009, 0.495211, 0.504942] },
  { name: "RightArm", parent: "RightShoulder", pos: [-0.200246, 1.463624, -0.067342], rot: [0.033464, -0.002485, 0.844286, 0.534841] },
  { name: "RightForeArm", parent: "RightArm", pos: [-0.424051, 1.35761, -0.059512], rot: [0.159954, -0.123848, 0.749498, 0.63034] },
  { name: "RightHand", parent: "RightForeArm", pos: [-0.667488, 1.31442, -0.055555], rot: [0.151229, -0.208793, 0.735991, 0.625982] },
  { name: "LeftUpLeg", parent: "Hips", pos: [0.106086, 0.960573, -0.032777], rot: [0.992909, 0.069558, 0.069565, 0.06674] },
  { name: "LeftLeg", parent: "LeftUpLeg", pos: [0.157057, 0.572323, 0.023483], rot: [0.998338, 0.040168, 0.040176, -0.00965] },
  { name: "LeftFoot", parent: "LeftLeg", pos: [0.191627, 0.146875, 0.016635], rot: [0.907325, 0.283564, 0.283571, 0.126256] },
  { name: "LeftToeBase", parent: "LeftFoot", pos: [0.248589, 0.043062, 0.066777], rot: [0.328509, 0.626161, 0.626165, -0.328514] },
  { name: "RightUpLeg", parent: "Hips", pos: [-0.111674, 0.959002, -0.032777], rot: [0.99341, -0.066209, -0.066208, 0.066103] },
  { name: "RightLeg", parent: "RightUpLeg", pos: [-0.160982, 0.564477, 0.023482], rot: [0.997479, -0.049816, -0.049815, -0.008461] },
  { name: "RightFoot", parent: "RightLeg", pos: [-0.203413, 0.14328, 0.018437], rot: [0.917996, -0.264596, -0.264596, 0.131379] },
  { name: "RightToeBase", parent: "RightFoot", pos: [-0.254192, 0.042586, 0.064942], rot: [0.302313, -0.639224, -0.639223, -0.302312] }
];
