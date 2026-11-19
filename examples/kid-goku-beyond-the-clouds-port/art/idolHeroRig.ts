/**
 * Rest skeleton of the rigged Idol hero `assets.cdSkyKidHero` (examples/kid-goku-beyond-the-clouds-port/assets/idol/cdSkyKidHero.glb),
 * read from the GLB's skin joints in parent-first order. Idol bones are unnamed; the joint map below was assigned from the
 * hierarchy and rest positions (model frame, metres): bone_0 hips 0.82 m, bone_1..bone_3 spine to chest, bone_4 neck,
 * bone_5 head, bone_6/bone_13 clavicles, bone_7/bone_14 upper arms (shoulders at x = +/-0.14), bone_8/bone_15 forearms,
 * bone_9/bone_16 wrists, bone_20/bone_24 thighs, bone_21/bone_25 shins, bone_22/bone_26 ankles. +X is the hero's left.
 * Regenerate if the GLB is re-rigged (the bone numbering is per model).
 */
import type { IdolRig } from "./idolHero";

export const IDOL_HERO_RIG: IdolRig = {
  bones: [
    { name: "bone_0", parent: -1, t: [0.029734, 0.02828, 0.001849], r: [-0.16283, -0.134058, 0.07866, 0.974334] },
    { name: "bone_1", parent: 0, t: [0.022085, 0.051541, -0.002142], r: [0.386477, 0.125254, 0.006516, 0.913731] },
    { name: "bone_2", parent: 1, t: [-0.006103, 0.042718, 0], r: [-0.233317, -0.027903, -0.095548, 0.967293] },
    { name: "bone_3", parent: 2, t: [-0.004795, 0.040756, 0], r: [0.016151, 0.0019, -0.014597, 0.999761] },
    { name: "bone_4", parent: 3, t: [-0.011626, 0.069758, 0], r: [0, 0, 0, 1] },
    { name: "bone_5", parent: 4, t: [-0.003875, 0.034879, 0], r: [0, 0, 0, 1] },
    { name: "bone_6", parent: 3, t: [-0.039275, 0.073925, -0.078445], r: [-0.075739, -0.210975, 0.057596, 0.972849] },
    { name: "bone_7", parent: 6, t: [0.001281, -0.006404, -0.021772], r: [0.119213, 0.205937, -0.064516, 0.969132] },
    { name: "bone_8", parent: 7, t: [0.008249, 0, -0.14024], r: [-0.044326, 0.002137, -0.002607, 0.999011] },
    { name: "bone_9", parent: 8, t: [0.003875, 0.003875, -0.147268], r: [0, 0, 0, 1] },
    { name: "bone_10", parent: 9, t: [0, 0, -0.011626], r: [-0.124598, 0.047316, -0.006759, 0.991055] },
    { name: "bone_11", parent: 10, t: [0, -0.002165, -0.015157], r: [0.133594, -0.054694, 0.005344, 0.989511] },
    { name: "bone_12", parent: 11, t: [-0.004851, 0, -0.048511], r: [0, 0, 0, 1] },
    { name: "bone_13", parent: 3, t: [-0.02655, 0.095701, 0.074618], r: [-0.247284, -0.243989, -0.057216, 0.935973] },
    { name: "bone_14", parent: 13, t: [0.001204, -0.006021, 0.020472], r: [0.31882, 0.285058, 0.044784, 0.902823] },
    { name: "bone_15", parent: 14, t: [0.00416, 0, 0.137283], r: [-0.060027, 0.005572, -0.002113, 0.998179] },
    { name: "bone_16", parent: 15, t: [0.004177, 0.004177, 0.158728], r: [-0.021918, -0.086903, -0.002955, 0.995971] },
    { name: "bone_17", parent: 16, t: [0.004376, -0.002188, 0.015317], r: [-0.054641, -0.069261, -0.011144, 0.996039] },
    { name: "bone_18", parent: 17, t: [-0.006844, 0, 0.020532], r: [0.045584, -0.007801, 0.01335, 0.998841] },
    { name: "bone_19", parent: 18, t: [0, 0, 0.041675], r: [0, 0, 0, 1] },
    { name: "bone_20", parent: 0, t: [-0.004972, -0.034807, -0.069615], r: [0.173381, 0.14623, -0.139575, 0.963885] },
    { name: "bone_21", parent: 20, t: [-0.010899, -0.21435, -0.018165], r: [-0.01833, -0.003415, 0.051363, 0.998506] },
    { name: "bone_22", parent: 21, t: [0, -0.189254, -0.017854], r: [0.002032, 0.003533, 0.007576, 0.999963] },
    { name: "bone_23", parent: 22, t: [0.07366, -0.053571, -0.010045], r: [0, 0, 0, 1] },
    { name: "bone_24", parent: 0, t: [-0.004219, -0.069972, 0.0512], r: [0.173352, 0.132368, -0.068816, 0.973495] },
    { name: "bone_25", parent: 24, t: [-0.014668, -0.216346, 0.029335], r: [0.003972, -0.002377, -0.02002, 0.999789] },
    { name: "bone_26", parent: 25, t: [0.003424, -0.181492, 0.030819], r: [-0.029414, -0.023263, -0.001433, 0.999296] },
    { name: "bone_27", parent: 26, t: [0.070846, -0.053978, 0.013494], r: [0, 0, 0, 1] }
  ],
  parentRotation: [0, -0.707107, 0, 0.707107],
  parentScale: 1.552233,
  joints: { pelvis: 0, spine: 1, torso: 3, neck: 4, head: 5, armL: 7, forearmL: 8, armR: 14, forearmR: 15, thighL: 20, shinL: 21, bootL: 22, thighR: 24, shinR: 25, bootR: 26 },
  limbs: [{ root: 7, tip: 9 }, { root: 14, tip: 16 }, { root: 20, tip: 22 }, { root: 24, tip: 26 }],
  restPelvisY: 0.72
};
