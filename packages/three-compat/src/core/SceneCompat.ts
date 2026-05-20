import { Object3DCompat } from "./Object3DCompat";
import { ColorCompat } from "../math";

export class SceneCompat extends Object3DCompat {
  override type = "Scene";
  background: ColorCompat | null = null;
  environment: unknown = null;
}
