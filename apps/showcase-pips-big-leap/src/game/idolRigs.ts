// GENERATED rest data for the rigged Idol GLBs (idolPose.ts), read from the shipped assets/idol/*.glb in model space
// (+Y up, +Z front; arm/leg L = the model -X side, as the old rigid rig placed armL/footL).
import type { IdolLimbRig } from "./idolPose.js";

/** pipHero.glb (28 bones). */
export const PIP_IDOL_RIG: IdolLimbRig | null = {
  armL: { bone: "bone_14", local: [0.67781,0.12411,0.02064,0.72439], parentWorld: [0.50005,0.56896,0.54065,-0.36597], dir: [-0.991,0.1232,-0.0522] },
  foreArmL: { bone: "bone_15", local: [0.09895,0.00339,-0.0014,0.99509], parentWorld: [-0.05882,-0.72286,-0.0605,0.68582], dir: [-0.9991,0.014,0.0408] },
  armR: { bone: "bone_7", local: [-0.36962,-0.12771,0.00876,0.92032], parentWorld: [0.27574,-0.56836,0.2822,0.72201], dir: [0.9984,-0.0358,0.0435] },
  foreArmR: { bone: "bone_8", local: [-0.03258,0.02922,-0.00272,0.99904], parentWorld: [0.01796,-0.722,0.02074,0.69134], dir: [0.994,-0.0105,0.109] },
  legL: { bone: "bone_24", local: [0.22117,0.08341,0.03141,0.97116], parentWorld: [-0.02684,-0.76041,-0.05399,0.64664], dir: [0.2331,-0.9711,0.0508] },
  shinL: { bone: "bone_25", local: [-0.19064,-0.00451,-0.0363,0.98098], parentWorld: [0.09756,-0.69564,0.13382,0.69904], dir: [-0.1493,-0.9885,-0.0219] },
  legR: { bone: "bone_20", local: [-0.05548,0.08163,-0.01532,0.995], parentWorld: [-0.02684,-0.76041,-0.05399,0.64664], dir: [-0.1865,-0.9786,-0.0864] },
  shinR: { bone: "bone_21", local: [0.10475,0.00168,0.03004,0.99404], parentWorld: [-0.04653,-0.70124,-0.108,0.70316], dir: [0.1325,-0.991,0.0195] },
  head: { bone: "bone_4", local: [-0.16804,-0.10223,0.43157,0.88037], parentWorld: [0.39024,-0.5098,-0.07921,0.76258], dir: [-0.1218,0.8981,-0.4225] }
};

/** pipBrambleback.glb (rigged Idol boss). */
export const BOSS_IDOL_RIG: IdolLimbRig | null = {
  armL: { bone: "bone_11", local: [-0.0684,0.19799,0.00496,0.9778], parentWorld: [0.05509,-0.53608,0.11018,0.83513], dir: [-0.4659,-0.1851,0.8653] },
  foreArmL: { bone: "bone_12", local: [-0.01353,-0.41579,-0.0804,0.9058], parentWorld: [-0.02774,-0.36664,0.08611,0.92595], dir: [-0.929,-0.1023,0.3556] },
  armR: { bone: "bone_7", local: [0.13323,0.2286,-0.07066,0.96177], parentWorld: [0.13339,0.94631,0.00628,-0.29439], dir: [0.7217,-0.0943,0.6857] },
  foreArmR: { bone: "bone_8", local: [-0.05364,0.23979,-0.06703,0.96702], parentWorld: [-0.02077,-0.85309,0.06874,0.51679], dir: [0.9095,-0.0859,0.4067] },
  legL: { bone: "bone_18", local: [-0.08551,0.03175,-0.01337,0.99574], parentWorld: [0.05101,-0.72655,0.06992,0.68164], dir: [-0.0902,-0.9918,-0.0902] },
  shinL: { bone: "bone_19", local: [0,0,0,1], parentWorld: [0,-0.70711,0,0.70711], dir: [-0.1333,-0.9333,-0.3333] },
  legR: { bone: "bone_14", local: [-0.08551,0.03175,-0.01337,0.99574], parentWorld: [0.05101,-0.72655,0.06992,0.68164], dir: [0.0452,-0.9949,-0.0904] },
  shinR: { bone: "bone_15", local: [0,0,0,1], parentWorld: [0,-0.70711,0,0.70711], dir: [0.0671,-0.9396,-0.3356] },
  head: { bone: "bone_4", local: [-0.10413,-0.06605,-0.46025,0.87918], parentWorld: [0.12081,-0.68036,0.01633,0.72267], dir: [0.0663,0.1198,0.9906] }
};
