/** A vector as an [x, y, z] tuple. */
export type Vec3 = readonly [number, number, number];

/** Linear interpolation between a and b. */
export declare function lerp(a: number, b: number, t: number): number;
