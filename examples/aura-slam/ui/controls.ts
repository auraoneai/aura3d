/**
 * The surface of controls.js (`window.TennisControls`) the UI depends on. M-INPUT's bindings module implements it;
 * the shell and the settings dialog only talk to this interface so the modules can be built independently.
 */
export type ControlDevice = "keyboard" | "controller";
export interface ControlActionInfo { id: string; label: string; description: string }
export interface ControlValidation { valid: boolean; errors: Array<{ action: string | null; input?: unknown; message: string }> }
export interface ControlApplyResult { ok: boolean; saved: boolean; errors: Array<{ action: string | null; message: string }> }
export interface ControlLabelOptions { all?: boolean; playStation?: boolean }

export interface ControlsPort {
  actions(device: ControlDevice): ControlActionInfo[];
  defaults(device: ControlDevice): Record<string, unknown> | null;
  getBindings(device: ControlDevice): Record<string, unknown> | null;
  validateBindings(device: ControlDevice, profile: unknown): ControlValidation;
  applyBindings(device: ControlDevice, profile: unknown): ControlApplyResult;
  actionForKey(code: string): string | null;
  isDown(action: string, keys: Record<string, boolean | undefined>): boolean;
  buttonFor(action: string): number | null;
  labelFor(action: string, device?: ControlDevice, options?: ControlLabelOptions): string;
  labelInput(input: unknown, device?: ControlDevice, options?: ControlLabelOptions): string;
  subscribe(listener: (change: { device: ControlDevice; bindings: unknown; saved: boolean }) => void): () => void;
}
