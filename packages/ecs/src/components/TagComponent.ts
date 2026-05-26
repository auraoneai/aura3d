import { ValidationError } from "@aura3d/core";

export class TagComponent {
  constructor(public tag: string) {
    if (!tag) throw new ValidationError("TAG_COMPONENT", "TagComponent requires a non-empty tag.");
  }
}
