/** Imperative drive surface for `?capture=scenario` staging (PRD-09). */
export interface CourierDrive {
  pumpFrames(frames: number): Promise<void>;
  placeVan(x: number, z: number, heading: number): void;
}
let drive: CourierDrive | undefined;
export function bindCourierDrive(d: CourierDrive): void { drive = d; }
export function courierDrive(): CourierDrive {
  if (!drive) throw new Error("courier drive unbound (scenario requested before boot)");
  return drive;
}
