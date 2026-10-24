export type Quat = [number, number, number, number];
export type Vec3 = [number, number, number];
export interface Glb { json: any; bin: Buffer }
export interface Fk { pos: Vec3[]; rot: Quat[]; nodes: any[]; names: string[]; parent: number[]; id(name: string): number }
export function qmul(a: Quat, b: Quat): Quat;
export function qconj(q: Quat): Quat;
export function qnorm(q: Quat): Quat;
export function qaxis(axis: Vec3, angle: number): Quat;
export function qrot(q: Quat, v: readonly number[]): Vec3;
export function qalign(a: Vec3, b: Vec3): Quat;
export function slerp(a: Quat, b: Quat, t: number): Quat;
export function readGlb(path: string): Glb;
export function accessor(glb: Glb, i: number): { data: Float32Array; n: number; count: number };
export function nodeIndex(glb: Glb): { nodes: any[]; names: string[]; parent: number[]; id(name: string): number };
export function clipDuration(glb: Glb, anim: any): number;
export function localPose(glb: Glb, anim: any, t: number): Array<{ t: Vec3; r: Quat }>;
export function forward(glb: Glb, trs: Array<{ t: Vec3; r: Quat }>): Fk;
export function withAnimations(glb: Glb, clips: any[]): Glb;
export function writeGlb(path: string, glb: Glb): { bytes: number; sha256: string };
