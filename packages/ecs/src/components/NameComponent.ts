import { ValidationError } from "@galileo3d/core";

export class NameComponent {
  constructor(public name: string) {
    if (!name) throw new ValidationError("NAME_COMPONENT", "NameComponent requires a non-empty name.");
  }
}
