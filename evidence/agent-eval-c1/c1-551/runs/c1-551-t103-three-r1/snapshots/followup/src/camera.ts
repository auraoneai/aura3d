import * as THREE from 'three';
import { L, K, center, channel, floorBase } from './terrain';

const per = (n: number): number => n * K;

/** Drift of the camera relative to the centre line, as a function of distance travelled. */
function drift(s: number): number {
  return 2.5 * Math.sin(per(11) * s + 0.4) + 1.2 * Math.sin(per(19) * s + 2);
}

/** Camera lateral offset from the canyon centre line at world z (z = -s). */
export function camU(z: number): number {
  return channel(z) * 0.6 + drift(-z);
}

export function camPos(s: number, lift: number, out: THREE.Vector3): THREE.Vector3 {
  const z = -s;
  const u = camU(z);
  return out.set(center(z) + u, floorBase(u, z) + 2.4 + lift, z);
}

export const LOOP = L;
