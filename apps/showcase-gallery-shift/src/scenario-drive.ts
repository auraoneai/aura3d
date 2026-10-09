/** Imperative drive surface for `?capture=scenario` staging (PRD-09). */
export interface GalleryDrive {
  pumpFrames(frames: number): void;
  teleport(x: number, z: number): unknown;
}
let drive: GalleryDrive | undefined;
export function bindGalleryDrive(d: GalleryDrive): void { drive = d; }
export function galleryDrive(): GalleryDrive {
  if (!drive) throw new Error("gallery drive unbound (scenario requested before boot)");
  return drive;
}
