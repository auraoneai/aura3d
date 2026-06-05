export type GameVec3 = readonly [number, number, number];

export type GameSubsystemOwner = "aura3d" | "app" | "shared";

export type GameRuntimeSubsystemId =
  | "runtime-nodes"
  | "frame-loop"
  | "input"
  | "kinematic-bodies"
  | "combat"
  | "effects"
  | "camera"
  | "animation"
  | "assets"
  | "stage"
  | "hud"
  | "accessibility";

export interface GameRuntimeSubsystemOwnership {
  readonly subsystem: GameRuntimeSubsystemId | string;
  readonly owner: GameSubsystemOwner;
  readonly configured: boolean;
  readonly evidence: string;
}

export type GameHudBindingKind = "health" | "meter" | "timer" | "combo" | "round" | "debug-toggle";
export type GameHudValueFormat = "number" | "percent" | "clock" | "text" | "boolean";
export type GameHudSourceKind = "combat" | "round" | "input" | "runtime" | "debug" | "app-state";

export interface GameHudBinding {
  readonly kind: "aura-game-hud-binding";
  readonly binding: GameHudBindingKind;
  readonly id: string;
  readonly label: string;
  readonly owner: "app";
  readonly source: GameHudSourceKind;
  readonly targetId?: string;
  readonly valuePath: string;
  readonly maxPath?: string;
  readonly format: GameHudValueFormat;
  readonly a11yLabel: string;
  readonly debugOnly: boolean;
  readonly interactive: boolean;
  readonly visibleWhen?: string;
}

export type GameHudResolvedValue = string | number | boolean | undefined;

export interface GameHudSnapshotItem {
  readonly kind: "aura-game-hud-value";
  readonly id: string;
  readonly binding: GameHudBindingKind;
  readonly label: string;
  readonly source: GameHudSourceKind;
  readonly targetId?: string;
  readonly valuePath: string;
  readonly value: GameHudResolvedValue;
  readonly max?: GameHudResolvedValue;
  readonly formatted: string;
  readonly changed: boolean;
  readonly debugOnly: boolean;
  readonly interactive: boolean;
  readonly a11yLabel: string;
}

export interface GameHudSnapshotOptions {
  readonly bindings: readonly GameHudBinding[];
  readonly combat?: GameCombatWorld | GameCombatWorldSnapshot;
  readonly events?: readonly GameCombatEvent[];
  readonly round?: Record<string, unknown>;
  readonly rules?: Record<string, unknown>;
  readonly input?: GameInputController | GameInputSnapshot;
  readonly runtime?: Record<string, unknown>;
  readonly debug?: Record<string, unknown>;
  readonly appState?: Record<string, unknown>;
}

export interface GameHudSnapshot {
  readonly kind: "aura-game-hud-snapshot";
  readonly frame: number;
  readonly time: number;
  readonly values: readonly GameHudSnapshotItem[];
  readonly changedIds: readonly string[];
  readonly events: readonly GameCombatEvent[];
}

export interface GameHudActorBindingOptions {
  readonly id?: string;
  readonly actorId: string;
  readonly label?: string;
  readonly valuePath?: string;
  readonly maxPath?: string;
  readonly a11yLabel?: string;
  readonly visibleWhen?: string;
}

export interface GameHudTimerBindingOptions {
  readonly id?: string;
  readonly label?: string;
  readonly valuePath?: string;
  readonly a11yLabel?: string;
  readonly visibleWhen?: string;
}

export interface GameHudComboBindingOptions {
  readonly id?: string;
  readonly actorId?: string;
  readonly label?: string;
  readonly valuePath?: string;
  readonly a11yLabel?: string;
  readonly visibleWhen?: string;
}

export interface GameHudRoundBindingOptions {
  readonly id?: string;
  readonly label?: string;
  readonly valuePath?: string;
  readonly a11yLabel?: string;
  readonly visibleWhen?: string;
}

export interface GameHudDebugToggleBindingOptions {
  readonly id?: string;
  readonly label?: string;
  readonly statePath?: string;
  readonly action?: string;
  readonly a11yLabel?: string;
  readonly visibleWhen?: string;
}

export type GameAccessibilitySourceKind =
  | "label"
  | "focus"
  | "reduced-motion"
  | "reduced-flash"
  | "high-contrast"
  | "pause-controls";

export interface GameAccessibilitySource {
  readonly kind: "aura-game-accessibility-source";
  readonly feature: GameAccessibilitySourceKind;
  readonly id: string;
  readonly owner: GameSubsystemOwner;
  readonly label: string;
  readonly targetId?: string;
  readonly role?: string;
  readonly actions: readonly string[];
  readonly enabled?: boolean;
  readonly source: "dom" | "media-query" | "input" | "app-state";
  readonly evidence: string;
}

export interface GameAccessibilityLabelOptions {
  readonly id?: string;
  readonly targetId: string;
  readonly label: string;
  readonly role?: string;
  readonly live?: boolean;
}

export interface GameAccessibilityFocusOptions {
  readonly id?: string;
  readonly scopeId: string;
  readonly label?: string;
  readonly targets?: readonly string[];
}

export interface GameAccessibilityPreferenceOptions {
  readonly id?: string;
  readonly enabled?: boolean;
  readonly label?: string;
}

export interface GameAccessibilityPauseControlsOptions {
  readonly id?: string;
  readonly label?: string;
  readonly actions?: readonly string[];
  readonly resumeActions?: readonly string[];
  readonly menuId?: string;
}

export interface GameAccessibilityRuntimeSettings {
  readonly kind: "aura-game-accessibility-runtime-settings";
  readonly reducedMotion: boolean;
  readonly reducedFlash: boolean;
  readonly highContrast: boolean;
  readonly camera: Pick<GameCameraDirectorOptions, "reducedMotion">;
  readonly effects: Pick<GameEffectsOptions, "reducedMotion" | "reducedFlash">;
  readonly evidence: readonly string[];
}

export interface GameAccessibilityRuntimeSettingsOptions {
  readonly reducedMotion?: boolean;
  readonly reducedFlash?: boolean;
  readonly highContrast?: boolean;
}
export type GameVec2 = readonly [number, number];

export type GameInputDeadzoneMode = "axial" | "scaled";

export interface GameInputAxisSettings {
  readonly deadzone?: number;
  readonly deadzoneMode?: GameInputDeadzoneMode;
  readonly smoothing?: number;
  readonly snap?: boolean;
  readonly scale?: number;
  readonly invert?: boolean;
}

export interface GameLoopPlan {
  readonly kind: "aura-game-loop-plan";
  readonly fixedDt: number;
  readonly maxSubSteps: number;
  readonly timeScale: number;
}

export interface GameInputAxisBinding extends GameInputAxisSettings {
  readonly negative?: string;
  readonly positive?: string;
  readonly gamepadAxis?: number;
  readonly gamepadIndex?: number;
  readonly pointerDelta?: "x" | "y";
}

export interface GameInputOptions {
  readonly actions: Record<string, readonly string[]>;
  readonly axes?: Record<string, GameInputAxisBinding>;
  readonly axisDefaults?: GameInputAxisSettings;
  readonly bufferMs?: number;
  readonly target?: EventTarget;
  readonly autoListen?: boolean;
  readonly pointer?: boolean;
  readonly touch?: boolean;
  readonly gamepad?: boolean | { readonly index?: number };
}

export interface GameInputActionState {
  readonly pressed: boolean;
  readonly held: boolean;
  readonly released: boolean;
  readonly buffered: boolean;
  readonly value: number;
}

export interface GameInputReplayEvent {
  readonly frame: number;
  readonly time: number;
  readonly type: "press" | "release";
  readonly binding: string;
}

export interface GamePointerSnapshot {
  readonly active: boolean;
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  readonly buttons: readonly number[];
}

export interface GamepadSnapshot {
  readonly connected: boolean;
  readonly index?: number;
  readonly axes: readonly number[];
  readonly buttons: readonly string[];
}

export interface GameInputSnapshot {
  readonly kind: "aura-game-input-snapshot";
  readonly frame: number;
  readonly time: number;
  readonly activeBindings: readonly string[];
  readonly actions: Record<string, GameInputActionState>;
  readonly axes?: Record<string, number>;
  readonly pointer: GamePointerSnapshot;
  readonly gamepads: readonly GamepadSnapshot[];
}

export interface GameInputController {
  readonly kind: "aura-game-input-plan";
  readonly actions: Record<string, readonly string[]>;
  readonly axes: Record<string, GameInputAxisBinding>;
  readonly bufferMs: number;
  update(dt?: number): GameInputSnapshot;
  snapshot(): GameInputSnapshot;
  pressed(action: string): boolean;
  held(action: string): boolean;
  released(action: string): boolean;
  buffered(action: string, windowMs?: number): boolean;
  combo(actions: readonly string[], windowMs?: number): boolean;
  axis(name: string, negativeAction?: string, positiveAction?: string): number;
  press(binding: string): void;
  release(binding: string): void;
  setAction(action: string, held: boolean): void;
  recorded(): readonly GameInputReplayEvent[];
  replay(events: readonly GameInputReplayEvent[], dt?: number): GameInputSnapshot;
  clearReplay(): void;
  dispose(): void;
}

export interface GameInputReplayOptions {
  readonly fps?: number;
  readonly seed?: number;
  readonly label?: string;
}

export interface GameInputReplayPlan {
  readonly kind: "aura-game-input-replay";
  readonly label?: string;
  readonly fps: number;
  readonly seed: number;
  readonly frameCount: number;
  readonly duration: number;
  readonly checksum: string;
  readonly events: readonly GameInputReplayEvent[];
}

export interface GameInputReplayDriverSnapshot {
  readonly kind: "aura-game-input-replay-driver";
  readonly frame: number;
  readonly time: number;
  readonly checksum: string;
  readonly complete: boolean;
}

export interface GameInputReplayDriver {
  readonly kind: "aura-game-input-replay-driver";
  readonly replay: GameInputReplayPlan;
  step(dt?: number): GameInputSnapshot;
  seek(frame: number, dt?: number): GameInputSnapshot;
  reset(): void;
  snapshot(): GameInputReplayDriverSnapshot;
}

export type GameTouchControlKind = "stick" | "dpad" | "button";
export type GameTouchControlAnchor = "bottom-left" | "bottom-right" | "top-left" | "top-right";

export interface GameTouchSafeArea {
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly left?: number;
}

export interface GameTouchControlRequest {
  readonly id?: string;
  readonly kind?: GameTouchControlKind;
  readonly action?: string;
  readonly label?: string;
  readonly side?: "left" | "right";
  readonly size?: number;
  readonly radius?: number;
  readonly binding?: string;
}

export interface GameTouchControlLayoutOptions {
  readonly width: number;
  readonly height: number;
  readonly safeArea?: GameTouchSafeArea;
  readonly scale?: number;
  readonly gap?: number;
  readonly stick?: false | GameTouchControlRequest;
  readonly buttons?: readonly GameTouchControlRequest[];
}

export interface GameTouchControlRegion {
  readonly id: string;
  readonly kind: GameTouchControlKind;
  readonly action?: string;
  readonly label: string;
  readonly binding: string;
  readonly anchor: GameTouchControlAnchor;
  readonly center: GameVec2;
  readonly radius: number;
  readonly rect: readonly [number, number, number, number];
  readonly zIndex: number;
}

export interface GameTouchControlLayout {
  readonly kind: "aura-game-touch-layout";
  readonly width: number;
  readonly height: number;
  readonly safeArea: Required<GameTouchSafeArea>;
  readonly controls: readonly GameTouchControlRegion[];
  readonly bindings: Record<string, string>;
}

export interface GameBounds3 {
  readonly minX?: number;
  readonly maxX?: number;
  readonly minY?: number;
  readonly maxY?: number;
  readonly minZ?: number;
  readonly maxZ?: number;
}

export interface GameKinematicMoveCommand {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  readonly axis?: number;
  readonly speed?: number;
  readonly jump?: boolean;
  readonly jumpVelocity?: number;
  readonly dash?: boolean | GameVec3;
  readonly dashSpeed?: number;
  readonly knockback?: GameVec2 | GameVec3;
}

export type GameCombatMoveDefinition = Omit<GameCombatMove, "id"> & {
  readonly id?: string;
};

export interface GameKinematicBodyOptions {
  readonly id?: string;
  readonly position?: GameVec3;
  readonly velocity?: GameVec3;
  readonly size?: GameVec3;
  readonly collider?: GameCollider;
  readonly gravity?: number | boolean;
  readonly groundY?: number;
  readonly friction?: number;
  readonly maxSpeed?: number;
  readonly jumpVelocity?: number;
  readonly coyoteMs?: number;
  readonly jumpBufferMs?: number;
  readonly bounds?: GameBounds3;
}

export interface GameKinematicBodySnapshot {
  readonly kind: "aura-game-kinematic-body";
  readonly id?: string;
  readonly position: GameVec3;
  readonly velocity: GameVec3;
  readonly size: GameVec3;
  readonly collider?: GameCollider;
  readonly grounded: boolean;
  readonly facing: 1 | -1;
  readonly coyoteAvailable?: boolean;
  readonly jumpBuffered?: boolean;
}

export interface GameKinematicBody {
  readonly id?: string;
  position: GameVec3;
  velocity: GameVec3;
  readonly size: GameVec3;
  readonly collider?: GameCollider;
  readonly grounded: boolean;
  readonly facing: 1 | -1;
  move(axis: number | GameKinematicMoveCommand, speedOrDt?: number): void | GameKinematicBodySnapshot;
  jump(velocity?: number): boolean;
  requestJump(): void;
  canJump(): boolean;
  consumeJump(velocity?: number): boolean;
  dash(direction: GameVec3, speed?: number): void;
  applyKnockback(velocity: GameVec3): void;
  defineMove(id: string, move: GameCombatMoveDefinition): GameCombatMove;
  attack(moveId: string): GameCombatMove | undefined;
  moves(): readonly GameCombatMove[];
  update(dt: number): GameKinematicBodySnapshot;
  snapToGround(groundY?: number): void;
  bounds(): GameAabb;
  snapshot(): GameKinematicBodySnapshot;
}

export interface GameAabb {
  readonly center: GameVec3;
  readonly size: GameVec3;
  readonly min: GameVec3;
  readonly max: GameVec3;
}

export interface GameJumpAssistOptions {
  readonly coyoteMs?: number;
  readonly bufferMs?: number;
}

export interface GameJumpAssistUpdate {
  readonly grounded: boolean;
  readonly jumpPressed?: boolean;
  readonly jumpRequested?: boolean;
}

export interface GameJumpAssistSnapshot {
  readonly kind: "aura-game-jump-assist";
  readonly time: number;
  readonly grounded: boolean;
  readonly coyoteMs: number;
  readonly bufferMs: number;
  readonly lastGroundedAt: number;
  readonly lastJumpRequestedAt: number;
  readonly coyoteAvailable: boolean;
  readonly jumpBuffered: boolean;
  readonly consumed: boolean;
  readonly canJump: boolean;
}

export interface GameJumpAssistController {
  readonly kind: "aura-game-jump-assist";
  update(dt: number, state: GameJumpAssistUpdate): GameJumpAssistSnapshot;
  requestJump(): void;
  canJump(): boolean;
  consume(): boolean;
  reset(state?: Partial<GameJumpAssistUpdate>): GameJumpAssistSnapshot;
  snapshot(): GameJumpAssistSnapshot;
}

export type GameColliderKind = "box" | "sphere" | "capsule" | "rect";
export type GameColliderDimension = 2 | 3;
export type GameColliderAxis = "x" | "y" | "z";
export type GameColliderPlane = "xy" | "xz" | "yz";

export interface GameColliderFactoryOptions {
  readonly id?: string;
  readonly center?: GameVec3;
  readonly offset?: GameVec3;
  readonly tags?: readonly string[];
  readonly dimension?: GameColliderDimension;
  readonly sensor?: boolean;
}

export interface GameBoxColliderOptions extends GameColliderFactoryOptions {
  readonly size?: GameVec3 | GameVec2;
  readonly width?: number;
  readonly height?: number;
  readonly depth?: number;
}

export interface GameSphereColliderOptions extends GameColliderFactoryOptions {
  readonly radius?: number;
}

export interface GameCapsuleColliderOptions extends GameColliderFactoryOptions {
  readonly radius?: number;
  readonly height?: number;
  readonly axis?: GameColliderAxis;
}

export interface GameRectColliderOptions extends GameColliderFactoryOptions {
  readonly size?: GameVec2;
  readonly width?: number;
  readonly height?: number;
  readonly plane?: GameColliderPlane;
}

export interface GameColliderBase {
  readonly id?: string;
  readonly kind: GameColliderKind;
  readonly center: GameVec3;
  readonly offset?: GameVec3;
  readonly tags: readonly string[];
  readonly dimension: GameColliderDimension;
  readonly sensor: boolean;
}

export interface GameBoxCollider extends GameColliderBase {
  readonly kind: "box";
  readonly size: GameVec3;
}

export interface GameSphereCollider extends GameColliderBase {
  readonly kind: "sphere";
  readonly radius: number;
}

export interface GameCapsuleCollider extends GameColliderBase {
  readonly kind: "capsule";
  readonly radius: number;
  readonly height: number;
  readonly axis: GameColliderAxis;
}

export interface GameRectCollider extends GameColliderBase {
  readonly kind: "rect";
  readonly size: GameVec2;
  readonly plane: GameColliderPlane;
}

export type GameCollider = GameBoxCollider | GameSphereCollider | GameCapsuleCollider | GameRectCollider;

export interface GameCollisionBox {
  readonly id?: string;
  readonly offset?: GameVec3;
  readonly center?: GameVec3;
  readonly size: GameVec3;
  readonly tags?: readonly string[];
}

export interface GameCollisionBoxFactoryOptions {
  readonly id?: string;
  readonly offset?: GameVec2 | GameVec3;
  readonly center?: GameVec2 | GameVec3;
  readonly size?: GameVec2 | GameVec3;
  readonly width?: number;
  readonly height?: number;
  readonly depth?: number;
  readonly tags?: readonly string[];
}

export type GameDebugGeometryPrimitive = "box" | "sphere" | "capsule" | "rect";

export interface GameDebugGeometryOptions {
  readonly color?: string;
  readonly opacity?: number;
  readonly wireframe?: boolean;
  readonly source?: string;
  readonly origin?: GameVec3;
  readonly facing?: 1 | -1;
  readonly mirrorX?: boolean;
}

export interface GameDebugGeometryNode {
  readonly kind: "aura-game-debug-geometry";
  readonly id: string;
  readonly primitive: GameDebugGeometryPrimitive;
  readonly position: GameVec3;
  readonly scale: GameVec3;
  readonly radius?: number;
  readonly height?: number;
  readonly axis?: GameColliderAxis;
  readonly plane?: GameColliderPlane;
  readonly color: string;
  readonly opacity: number;
  readonly wireframe: boolean;
  readonly source: string;
  readonly tags: readonly string[];
  readonly aabb: GameAabb;
}

export interface GameCombatActorOptions {
  readonly id: string;
  readonly team?: string;
  readonly position?: GameVec3;
  readonly facing?: 1 | -1;
  readonly health?: number;
  readonly guard?: number;
  readonly meter?: number;
  readonly hurtboxes?: readonly GameCollisionBox[];
  readonly guardboxes?: readonly GameCollisionBox[];
  readonly pushboxes?: readonly GameCollisionBox[];
  readonly guarding?: boolean;
}

export interface GameCombatActorSnapshot extends Required<Omit<GameCombatActorOptions, "position" | "hurtboxes" | "guardboxes" | "pushboxes" | "facing">> {
  readonly position: GameVec3;
  readonly facing: 1 | -1;
  readonly hurtboxes: readonly GameCollisionBox[];
  readonly guardboxes: readonly GameCollisionBox[];
  readonly pushboxes: readonly GameCollisionBox[];
  readonly stun: number;
  readonly recovery: number;
}

export interface GameCombatMove {
  readonly id: string;
  readonly name?: string;
  readonly startup?: number;
  readonly active?: number;
  readonly damage?: number;
  readonly guardDamage?: number;
  readonly meterGain?: number;
  readonly hitStop?: number;
  readonly hitStun?: number;
  readonly blockStun?: number;
  readonly recovery?: number;
  readonly knockback?: GameVec3;
  readonly activeFrames?: readonly [number, number];
  readonly durationFrames?: number;
  readonly hitbox?: GameCollisionBox;
  readonly hitboxes?: readonly GameCollisionBox[];
  readonly blockable?: boolean;
}

export type GameCombatEventType = "hit" | "blocked" | "whiff" | "push";

export interface GameCombatEvent {
  readonly type: GameCombatEventType;
  readonly frame: number;
  readonly time: number;
  readonly attackerId: string;
  readonly targetId?: string;
  readonly moveId?: string;
  readonly damage?: number;
  readonly guardDamage?: number;
  readonly hitStop?: number;
  readonly stun?: number;
  readonly knockback?: GameVec3;
  readonly position: GameVec3;
}

export interface GameCombatActiveAttackSnapshot {
  readonly attackerId: string;
  readonly moveId: string;
  readonly frame: number;
  readonly activeFrames: readonly [number, number];
  readonly durationFrames: number;
  readonly active: boolean;
  readonly hitboxes: readonly GameCollisionBox[];
  readonly hitTargets: readonly string[];
}

export interface GameCombatWorldSnapshot {
  readonly kind: "aura-game-combat-world";
  readonly frame: number;
  readonly time: number;
  readonly actors: readonly GameCombatActorSnapshot[];
  readonly activeAttacks: readonly GameCombatActiveAttackSnapshot[];
  readonly events: readonly GameCombatEvent[];
}

export interface GameCombatWorld {
  addActor(actor: GameCombatActorOptions): void;
  setActor(id: string, patch: Partial<GameCombatActorOptions>): void;
  removeActor(id: string): void;
  defineMove(actorId: string, move: GameCombatMove): void;
  attack(attackerId: string, move: string | GameCombatMove): void;
  beginAttack(attackerId: string, move: GameCombatMove): void;
  update(dt: number): GameCombatWorldSnapshot;
  step(dt: number): readonly GameCombatEvent[];
  events(): readonly GameCombatEvent[];
  consumeEvents(): readonly GameCombatEvent[];
  snapshot(): GameCombatWorldSnapshot;
  clear(): void;
}

export interface GameFighting2DRulesOptions {
  readonly gravity?: number;
  readonly roundSeconds?: number;
  readonly maxHealth?: number;
  readonly maxGuard?: number;
  readonly maxMeter?: number;
  readonly stageBounds?: GameBounds3;
  readonly fps?: number;
  readonly pushboxSeparation?: boolean;
}

export interface GameFighting2DRules {
  readonly kind: "aura-game-fighting-2d-rules";
  readonly gravity: number;
  readonly roundSeconds: number;
  readonly maxHealth: number;
  readonly maxGuard: number;
  readonly maxMeter: number;
  readonly stageBounds: GameBounds3;
  readonly fps: number;
  readonly pushboxSeparation: boolean;
}

export interface GameCombatWorldOptions {
  readonly fighters?: readonly (GameKinematicBody | GameCombatActorOptions)[];
  readonly rules?: GameFighting2DRules;
  readonly stageBounds?: GameBounds3;
}

export type GameCameraDirectorMode = "side-fighter" | "follow" | "fixed";

export interface GameCameraDirectorOptions {
  readonly targetIds?: readonly string[];
  readonly mode?: GameCameraDirectorMode;
  readonly targetY?: number;
  readonly distance?: number;
  readonly baseFov?: number;
  readonly minZoom?: number;
  readonly maxZoom?: number;
  readonly bounds?: GameBounds3;
  readonly stageBounds?: GameBounds3;
  readonly impactShake?: boolean;
  readonly smoothing?: number;
  readonly deadZone?: number;
  readonly reducedMotion?: boolean;
}

export interface GameCameraTarget {
  readonly id?: string;
  readonly position: GameVec3;
}

export interface GameCameraSnapshot {
  readonly kind: "aura-game-camera-director";
  readonly position: GameVec3;
  readonly target: GameVec3;
  readonly fov: number;
  readonly zoom: number;
  readonly shake: number;
  readonly reducedMotion: boolean;
  readonly mode?: GameCameraDirectorMode;
  readonly targetIds?: readonly string[];
}

export interface GameCameraDirector {
  update(dt: number, targets: readonly GameCameraTarget[]): GameCameraSnapshot;
  impact(intensity?: number, duration?: number): void;
  special(target?: GameVec3, duration?: number): void;
  snapshot(): GameCameraSnapshot;
}

export type GameEffectKind =
  | "hit-spark"
  | "block-spark"
  | "impact-decal"
  | "ground-dust"
  | "dash-trail"
  | "slash-trail"
  | "impact-flash"
  | "aura-burst"
  | "shockwave"
  | "ring-shockwave"
  | "super-flash";

export interface GameEffectsOptions {
  readonly poolSize?: number;
  readonly reducedMotion?: boolean;
  readonly reducedFlash?: boolean;
  readonly sparks?: GameEffectPreset;
  readonly trails?: GameEffectPreset;
  readonly superBurst?: GameEffectPreset;
  readonly presets?: Record<string, GameEffectPreset>;
}

export interface GameEffectOptions {
  readonly color?: string;
  readonly intensity?: number;
  readonly duration?: number;
  readonly radius?: number;
  readonly ownerId?: string;
  readonly attachment?: GameEffectAttachment;
}

export interface GameEffectPreset {
  readonly kind: GameEffectKind;
  readonly options?: GameEffectOptions;
}

export interface GameEffectAttachment {
  readonly id?: string;
  readonly targetId?: string;
  readonly offset?: GameVec3;
  readonly getPosition?: () => GameVec3;
}

export interface GameEffectInstance extends Required<Omit<GameEffectOptions, "ownerId" | "attachment">> {
  readonly id: string;
  readonly kind: GameEffectKind;
  readonly position: GameVec3;
  readonly ownerId?: string;
  readonly attachmentId?: string;
  readonly attachmentOffset?: GameVec3;
  readonly age: number;
}

export interface GameEffectsSnapshot {
  readonly kind: "aura-game-effects";
  readonly active: number;
  readonly spawned: number;
  readonly pooled: number;
  readonly reducedMotion: boolean;
  readonly reducedFlash: boolean;
  readonly effects: readonly GameEffectInstance[];
}

export interface GameEffectsController {
  spawn(kind: GameEffectKind, position: GameVec3, options?: GameEffectOptions): GameEffectInstance;
  emit(events: readonly GameCombatEvent[], options?: GameEffectOptions): readonly GameEffectInstance[];
  hitSpark(position: GameVec3, options?: GameEffectOptions): GameEffectInstance;
  blockSpark(position: GameVec3, options?: GameEffectOptions): GameEffectInstance;
  impactDecal(position: GameVec3, options?: GameEffectOptions): GameEffectInstance;
  groundDust(position: GameVec3, options?: GameEffectOptions): GameEffectInstance;
  dashTrail(position: GameVec3, options?: GameEffectOptions): GameEffectInstance;
  slashTrail(position: GameVec3, options?: GameEffectOptions): GameEffectInstance;
  impactFlash(position: GameVec3, options?: GameEffectOptions): GameEffectInstance;
  auraBurst(position: GameVec3, options?: GameEffectOptions): GameEffectInstance;
  shockwave(position: GameVec3, options?: GameEffectOptions): GameEffectInstance;
  ringShockwave(position: GameVec3, options?: GameEffectOptions): GameEffectInstance;
  superFlash(position: GameVec3, options?: GameEffectOptions): GameEffectInstance;
  update(dt: number): GameEffectsSnapshot;
  snapshot(): GameEffectsSnapshot;
  nodes(): readonly any[];
  clear(): void;
}

export interface GameDebugOverlayMetric {
  readonly id: string;
  readonly label: string;
  readonly value: string | number | boolean;
  readonly severity?: "info" | "warn" | "error";
}

export interface GameDebugOverlaySection {
  readonly id: string;
  readonly title: string;
  readonly metrics: readonly GameDebugOverlayMetric[];
}

export interface GameDebugOverlayOptions {
  readonly runtime?: {
    readonly frame: number;
    readonly time: number;
    readonly paused?: boolean;
  };
  readonly input?: GameInputController | GameInputSnapshot;
  readonly bodies?: readonly GameKinematicBody[];
  readonly bodySnapshots?: readonly GameKinematicBodySnapshot[];
  readonly combat?: GameCombatWorld | GameCombatWorldSnapshot;
  readonly effects?: GameEffectsController | GameEffectsSnapshot;
  readonly camera?: GameCameraDirector | GameCameraSnapshot;
  readonly colliders?: readonly GameCollider[];
  readonly hitboxes?: readonly GameCollisionBox[];
  readonly labels?: Record<string, string | number | boolean>;
  readonly warnings?: readonly string[];
}

export interface GameDebugOverlayData {
  readonly kind: "aura-game-debug-overlay";
  readonly frame: number;
  readonly time: number;
  readonly paused: boolean;
  readonly sections: readonly GameDebugOverlaySection[];
  readonly geometry: readonly GameDebugGeometryNode[];
  readonly labels: Record<string, string | number | boolean>;
  readonly warnings: readonly string[];
}

export type GameDebugScenePrimitive = "box" | "sphere" | "capsule" | "plane";

export interface GameDebugSceneNode {
  readonly kind: "primitive" | "label";
  readonly primitive?: GameDebugScenePrimitive;
  readonly name: string;
  readonly position: GameVec3;
  readonly scale?: number | GameVec3;
  readonly material?: {
    readonly color: string;
    readonly emissive?: string;
    readonly emissiveIntensity?: number;
    readonly opacity?: number;
    readonly transparent?: boolean;
    readonly wireframe?: boolean;
  };
  readonly text?: string;
  readonly color?: string;
  readonly background?: string;
  readonly size?: number;
  readonly runtime?: {
    readonly id: string;
    readonly mutable: boolean;
    readonly tags: readonly string[];
  };
  readonly debug?: {
    readonly source: string;
    readonly tags: readonly string[];
    readonly aabb: GameAabb;
  };
}

export interface GameDebugSceneNodeOptions {
  readonly runtimePrefix?: string;
  readonly includeLabels?: boolean;
}

export interface GameCombatEventRuntimeBridgeOptions {
  readonly combat?: GameCombatWorld | GameCombatWorldSnapshot;
  readonly effects?: GameEffectsController;
  readonly camera?: GameCameraDirector;
  readonly hudBindings?: readonly GameHudBinding[];
  readonly round?: Record<string, unknown>;
  readonly rules?: Record<string, unknown>;
  readonly input?: GameInputController | GameInputSnapshot;
  readonly runtime?: Record<string, unknown>;
  readonly debug?: Record<string, unknown>;
  readonly appState?: Record<string, unknown>;
}

export interface GameCombatEventRuntimeBridgeResult {
  readonly kind: "aura-game-combat-event-runtime-bridge";
  readonly events: readonly GameCombatEvent[];
  readonly effectIds: readonly string[];
  readonly cameraImpacts: number;
  readonly hud?: GameHudSnapshot;
}

export function createGameLoopPlan(options: Partial<Omit<GameLoopPlan, "kind">> = {}): GameLoopPlan {
  return {
    kind: "aura-game-loop-plan",
    fixedDt: options.fixedDt ?? 1 / 60,
    maxSubSteps: options.maxSubSteps ?? 5,
    timeScale: options.timeScale ?? 1
  };
}

export function createGameJumpAssist(options: GameJumpAssistOptions = {}): GameJumpAssistController {
  const coyoteMs = Math.max(0, options.coyoteMs ?? 100);
  const bufferMs = Math.max(0, options.bufferMs ?? 120);
  const coyoteSeconds = coyoteMs / 1000;
  const bufferSeconds = bufferMs / 1000;
  let time = 0;
  let grounded = false;
  let lastGroundedAt = Number.NEGATIVE_INFINITY;
  let lastJumpRequestedAt = Number.NEGATIVE_INFINITY;
  let consumed = false;
  const coyoteAvailable = () => grounded || time - lastGroundedAt <= coyoteSeconds;
  const jumpBuffered = () => time - lastJumpRequestedAt <= bufferSeconds;
  const snapshot = (): GameJumpAssistSnapshot => ({
    kind: "aura-game-jump-assist",
    time,
    grounded,
    coyoteMs,
    bufferMs,
    lastGroundedAt,
    lastJumpRequestedAt,
    coyoteAvailable: coyoteAvailable(),
    jumpBuffered: jumpBuffered(),
    consumed,
    canJump: coyoteAvailable() && jumpBuffered() && !consumed
  });
  return {
    kind: "aura-game-jump-assist",
    update(dt, state) {
      time += Math.max(0, dt);
      grounded = state.grounded;
      if (grounded) {
        lastGroundedAt = time;
        consumed = false;
      }
      if (state.jumpPressed || state.jumpRequested) lastJumpRequestedAt = time;
      return snapshot();
    },
    requestJump() {
      lastJumpRequestedAt = time;
    },
    canJump() {
      return coyoteAvailable() && jumpBuffered() && !consumed;
    },
    consume() {
      if (!this.canJump()) return false;
      consumed = true;
      lastJumpRequestedAt = Number.NEGATIVE_INFINITY;
      return true;
    },
    reset(state = {}) {
      time = 0;
      grounded = state.grounded ?? false;
      lastGroundedAt = grounded ? 0 : Number.NEGATIVE_INFINITY;
      lastJumpRequestedAt = state.jumpPressed || state.jumpRequested ? 0 : Number.NEGATIVE_INFINITY;
      consumed = false;
      return snapshot();
    },
    snapshot
  };
}

export function createGameInputReplay(
  events: readonly GameInputReplayEvent[],
  options: GameInputReplayOptions = {}
): GameInputReplayPlan {
  const fps = Math.max(1, options.fps ?? 60);
  const seed = options.seed ?? 0;
  const normalized = normalizeReplayEvents(events);
  const frameCount = normalized.reduce((max, event) => Math.max(max, event.frame), 0);
  const duration = normalized.reduce((max, event) => Math.max(max, event.time), frameCount / fps);
  const checksum = replayChecksum(normalized, seed, fps);
  return {
    kind: "aura-game-input-replay",
    label: options.label,
    fps,
    seed,
    frameCount,
    duration,
    checksum,
    events: normalized
  };
}

export function gameInputReplayEventsAt(
  replay: GameInputReplayPlan,
  frame: number
): readonly GameInputReplayEvent[] {
  return replay.events.filter((event) => event.frame === frame);
}

export function createGameInputReplayDriver(
  input: GameInputController,
  replay: GameInputReplayPlan
): GameInputReplayDriver {
  let frame = 0;
  let time = 0;
  const seek = (targetFrame: number, dt = 1 / replay.fps): GameInputSnapshot => {
    frame = Math.max(0, Math.floor(targetFrame));
    time = frame / replay.fps;
    return input.replay(replay.events.filter((event) => event.frame <= frame), dt);
  };
  return {
    kind: "aura-game-input-replay-driver",
    replay,
    step(dt = 1 / replay.fps) {
      frame += 1;
      time += Math.max(0, dt);
      return input.replay(replay.events.filter((event) => event.frame <= frame), dt);
    },
    seek,
    reset() {
      frame = 0;
      time = 0;
      input.replay([], 0);
    },
    snapshot() {
      return {
        kind: "aura-game-input-replay-driver",
        frame,
        time,
        checksum: replay.checksum,
        complete: frame >= replay.frameCount
      };
    }
  };
}

export function createGameTouchControlLayout(options: GameTouchControlLayoutOptions): GameTouchControlLayout {
  const width = Math.max(1, options.width);
  const height = Math.max(1, options.height);
  const safeArea = {
    top: options.safeArea?.top ?? 0,
    right: options.safeArea?.right ?? 0,
    bottom: options.safeArea?.bottom ?? 0,
    left: options.safeArea?.left ?? 0
  };
  const scale = options.scale ?? clamp(Math.min(width, height) / 720, 0.72, 1.35);
  const gap = options.gap ?? 16 * scale;
  const margin = 32 * scale;
  const controls: GameTouchControlRegion[] = [];
  const bindings: Record<string, string> = {};
  const addControl = (request: GameTouchControlRequest, center: GameVec2, anchor: GameTouchControlAnchor, zIndex: number) => {
    const kind = request.kind ?? "button";
    const radius = request.radius ?? (request.size ?? (kind === "button" ? 58 : 72)) * scale;
    const id = request.id ?? request.action ?? `touch-${controls.length + 1}`;
    const binding = request.binding ?? `Touch:${id}`;
    const label = request.label ?? request.action ?? id;
    const region: GameTouchControlRegion = {
      id,
      kind,
      action: request.action,
      label,
      binding,
      anchor,
      center,
      radius,
      rect: [center[0] - radius, center[1] - radius, radius * 2, radius * 2],
      zIndex
    };
    controls.push(region);
    if (request.action) bindings[request.action] = binding;
  };
  if (options.stick !== false) {
    const stick = options.stick ?? {};
    const radius = stick.radius ?? (stick.size ?? 76) * scale;
    addControl(
      { id: "move", kind: "stick", label: "Move", binding: "TouchStickMove", ...stick },
      [safeArea.left + margin + radius, height - safeArea.bottom - margin - radius],
      "bottom-left",
      10
    );
  }
  const buttons = options.buttons ?? [
    { action: "jump", label: "Jump", binding: "TouchJump" },
    { action: "light", label: "Light", binding: "TouchLight" },
    { action: "special", label: "Special", binding: "TouchSpecial" }
  ];
  buttons.forEach((button, index) => {
    const radius = button.radius ?? (button.size ?? 54) * scale;
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = width - safeArea.right - margin - radius - column * (radius * 2 + gap);
    const y = height - safeArea.bottom - margin - radius - row * (radius * 2 + gap);
    addControl(button, [x, y], "bottom-right", 20 + index);
  });
  return {
    kind: "aura-game-touch-layout",
    width,
    height,
    safeArea,
    controls,
    bindings
  };
}

export function createGameInput(options: GameInputOptions): GameInputController {
  const actions = options.actions;
  const axes = options.axes ?? {};
  const axisDefaults = options.axisDefaults ?? {};
  const bufferMs = options.bufferMs ?? 120;
  const activeBindings = new Set<string>();
  const activeActionOverrides = new Set<string>();
  const previousHeld = new Map<string, boolean>();
  const currentHeld = new Map<string, boolean>();
  const pressedEdges = new Set<string>();
  const releasedEdges = new Set<string>();
  const lastPressedAt = new Map<string, number>();
  const actionPressHistory: { readonly action: string; readonly timeMs: number }[] = [];
  const replayEvents: GameInputReplayEvent[] = [];
  const gamepadBindings = new Set<string>();
  const axisValues = new Map<string, number>();
  let frame = 0;
  let time = 0;
  let pointer: GamePointerSnapshot = { active: false, x: 0, y: 0, dx: 0, dy: 0, buttons: [] };
  let latestGamepads: GamepadSnapshot[] = [];
  let latestSnapshot: GameInputSnapshot = {
    kind: "aura-game-input-snapshot",
    frame,
    time,
    activeBindings: [],
    actions: {},
    axes: {},
    pointer,
    gamepads: []
  };

  const resolveHeld = (action: string): boolean => {
    if (activeActionOverrides.has(action)) return true;
    const bindings = actions[action] ?? [];
    return bindings.some((binding) => activeBindings.has(binding));
  };
  const isActionHeld = (action: string): boolean => currentHeld.get(action) ?? resolveHeld(action);
  const record = (type: GameInputReplayEvent["type"], binding: string) => {
    replayEvents.push({ frame, time, type, binding });
  };
  const pressBinding = (binding: string, shouldRecord = true) => {
    activeBindings.add(binding);
    if (actions[binding]) activeActionOverrides.add(binding);
    if (shouldRecord) record("press", binding);
  };
  const releaseBinding = (binding: string, shouldRecord = true) => {
    activeBindings.delete(binding);
    activeActionOverrides.delete(binding);
    if (shouldRecord) record("release", binding);
  };
  const pollGamepads = () => {
    for (const binding of gamepadBindings) activeBindings.delete(binding);
    gamepadBindings.clear();
    latestGamepads = [];
    if (options.gamepad === false || typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return;
    const requestedIndex = typeof options.gamepad === "object" ? options.gamepad.index : undefined;
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (!pad || (requestedIndex !== undefined && pad.index !== requestedIndex)) continue;
      const buttonNames: string[] = [];
      pad.buttons.forEach((button, index) => {
        if (!button.pressed) return;
        const names = gamepadButtonNames(index, pad.index);
        for (const name of names) {
          activeBindings.add(name);
          gamepadBindings.add(name);
          buttonNames.push(name);
        }
      });
      latestGamepads.push({
        connected: true,
        index: pad.index,
        axes: [...pad.axes],
        buttons: buttonNames
      });
    }
  };
  const resolveAxisRaw = (
    name: string,
    negativeAction?: string,
    positiveAction?: string,
    framePointer: GamePointerSnapshot = latestSnapshot.pointer ?? pointer
  ): number => {
    const binding = axes[name];
    const negative = negativeAction ?? binding?.negative;
    const positive = positiveAction ?? binding?.positive;
    const digital = (positive && isActionHeld(positive) ? 1 : 0) - (negative && isActionHeld(negative) ? 1 : 0);
    const gamepadAxis = binding?.gamepadAxis;
    const pad = latestGamepads.find((snapshot) => binding?.gamepadIndex === undefined || snapshot.index === binding.gamepadIndex);
    const deadzone = binding?.deadzone ?? axisDefaults.deadzone ?? 0.18;
    const deadzoneMode = binding?.deadzoneMode ?? axisDefaults.deadzoneMode ?? "axial";
    const analog = gamepadAxis === undefined ? 0 : applyDeadzone(pad?.axes[gamepadAxis] ?? 0, deadzone, deadzoneMode);
    const pointerAxis = binding?.pointerDelta === "x" ? framePointer.dx : binding?.pointerDelta === "y" ? framePointer.dy : 0;
    if (!binding && !negative && !positive) return isActionHeld(name) ? 1 : 0;
    const invert = binding?.invert ?? axisDefaults.invert ?? false;
    const scale = binding?.scale ?? axisDefaults.scale ?? 1;
    return clamp((digital || analog || pointerAxis / 96) * scale * (invert ? -1 : 1), -1, 1);
  };
  const smoothAxis = (name: string, raw: number, dt: number): number => {
    const binding = axes[name];
    const smoothing = binding?.smoothing ?? axisDefaults.smoothing ?? 0;
    const previous = axisValues.get(name) ?? 0;
    const snap = binding?.snap ?? axisDefaults.snap ?? false;
    if (smoothing <= 0 || dt <= 0 || (snap && Math.sign(previous) !== 0 && Math.sign(raw) !== 0 && Math.sign(previous) !== Math.sign(raw))) return raw;
    const t = 1 - Math.exp(-smoothing * dt);
    return clamp(previous + (raw - previous) * t, -1, 1);
  };
  const toSnapshot = (framePointer: GamePointerSnapshot, axesSnapshot: Record<string, number>): GameInputSnapshot => {
    const actionStates: Record<string, GameInputActionState> = {};
    const nowMs = time * 1000;
    for (const action of Object.keys(actions)) {
      const held = currentHeld.get(action) ?? false;
      actionStates[action] = {
        pressed: pressedEdges.has(action),
        held,
        released: releasedEdges.has(action),
        buffered: pressedEdges.has(action) || nowMs - (lastPressedAt.get(action) ?? Number.NEGATIVE_INFINITY) <= bufferMs,
        value: held ? 1 : 0
      };
    }
    return {
      kind: "aura-game-input-snapshot",
      frame,
      time,
      activeBindings: [...activeBindings].sort(),
      actions: actionStates,
      axes: axesSnapshot,
      pointer: framePointer,
      gamepads: latestGamepads
    };
  };
  const update = (dt = 1 / 60): GameInputSnapshot => {
    const seconds = Math.max(0, dt);
    frame += 1;
    time += seconds;
    const framePointer = pointer;
    pollGamepads();
    pressedEdges.clear();
    releasedEdges.clear();
    for (const action of Object.keys(actions)) {
      const held = resolveHeld(action);
      const wasHeld = previousHeld.get(action) ?? false;
      currentHeld.set(action, held);
      if (held && !wasHeld) {
        pressedEdges.add(action);
        const nowMs = time * 1000;
        lastPressedAt.set(action, nowMs);
        actionPressHistory.push({ action, timeMs: nowMs });
        while (actionPressHistory.length > 64) actionPressHistory.shift();
      }
      if (!held && wasHeld) releasedEdges.add(action);
      previousHeld.set(action, held);
    }
    const axesSnapshot: Record<string, number> = {};
    for (const axisName of Object.keys(axes)) {
      const raw = resolveAxisRaw(axisName, undefined, undefined, framePointer);
      const value = smoothAxis(axisName, raw, seconds);
      axisValues.set(axisName, value);
      axesSnapshot[axisName] = value;
    }
    latestSnapshot = toSnapshot(framePointer, axesSnapshot);
    pointer = { ...pointer, dx: 0, dy: 0 };
    return latestSnapshot;
  };
  const target = options.target ?? (typeof window !== "undefined" ? window : undefined);
  const onKeyDown = (event: Event) => {
    const keyboard = event as KeyboardEvent;
    if (keyboard.repeat) return;
    if (keyboard.code) pressBinding(keyboard.code);
    if (keyboard.key && keyboard.key !== keyboard.code) pressBinding(keyboard.key);
  };
  const onKeyUp = (event: Event) => {
    const keyboard = event as KeyboardEvent;
    if (keyboard.code) releaseBinding(keyboard.code);
    if (keyboard.key && keyboard.key !== keyboard.code) releaseBinding(keyboard.key);
  };
  const onPointerDown = (event: Event) => {
    if (options.pointer === false) return;
    const next = event as PointerEvent;
    pressBinding(next.button === 2 ? "PointerSecondary" : "PointerPrimary");
    pressBinding(`PointerButton${next.button}`);
    pointer = {
      active: true,
      x: next.clientX,
      y: next.clientY,
      dx: 0,
      dy: 0,
      buttons: [...new Set([...pointer.buttons, next.button])].sort()
    };
  };
  const onPointerMove = (event: Event) => {
    if (options.pointer === false) return;
    const next = event as PointerEvent;
    pointer = {
      ...pointer,
      x: next.clientX,
      y: next.clientY,
      dx: pointer.dx + next.clientX - pointer.x,
      dy: pointer.dy + next.clientY - pointer.y
    };
  };
  const onPointerUp = (event: Event) => {
    if (options.pointer === false) return;
    const next = event as PointerEvent;
    releaseBinding(next.button === 2 ? "PointerSecondary" : "PointerPrimary");
    releaseBinding(`PointerButton${next.button}`);
    const buttons = pointer.buttons.filter((button) => button !== next.button);
    pointer = {
      active: buttons.length > 0,
      x: next.clientX,
      y: next.clientY,
      dx: pointer.dx + next.clientX - pointer.x,
      dy: pointer.dy + next.clientY - pointer.y,
      buttons
    };
  };
  const onTouchStart = (event: Event) => {
    if (options.touch === false) return;
    const touch = (event as TouchEvent).touches[0];
    pressBinding("TouchPrimary");
    if (touch) pointer = { active: true, x: touch.clientX, y: touch.clientY, dx: 0, dy: 0, buttons: [0] };
  };
  const onTouchEnd = () => {
    if (options.touch === false) return;
    releaseBinding("TouchPrimary");
    pointer = { ...pointer, active: false, buttons: [] };
  };
  if (options.autoListen !== false && target?.addEventListener) {
    target.addEventListener("keydown", onKeyDown);
    target.addEventListener("keyup", onKeyUp);
    target.addEventListener("pointerdown", onPointerDown);
    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
    target.addEventListener("touchstart", onTouchStart);
    target.addEventListener("touchend", onTouchEnd);
    target.addEventListener("touchcancel", onTouchEnd);
  }

  return {
    kind: "aura-game-input-plan",
    actions,
    axes,
    bufferMs,
    update,
    snapshot() {
      return latestSnapshot;
    },
    pressed(action) {
      return pressedEdges.has(action);
    },
    held(action) {
      return currentHeld.get(action) ?? resolveHeld(action);
    },
    released(action) {
      return releasedEdges.has(action);
    },
    buffered(action, windowMs = bufferMs) {
      return pressedEdges.has(action) || time * 1000 - (lastPressedAt.get(action) ?? Number.NEGATIVE_INFINITY) <= windowMs;
    },
    combo(sequence, windowMs = bufferMs * Math.max(1, sequence.length)) {
      if (sequence.length === 0) return false;
      const nowMs = time * 1000;
      const recent = actionPressHistory.filter((entry) => nowMs - entry.timeMs <= windowMs);
      let cursor = sequence.length - 1;
      for (let index = recent.length - 1; index >= 0 && cursor >= 0; index -= 1) {
        if (recent[index]?.action === sequence[cursor]) cursor -= 1;
      }
      return cursor < 0;
    },
    axis(name, negativeAction, positiveAction) {
      if (!negativeAction && !positiveAction && axisValues.has(name)) return axisValues.get(name) ?? 0;
      return resolveAxisRaw(name, negativeAction, positiveAction, latestSnapshot.pointer ?? pointer);
    },
    press(binding) {
      pressBinding(binding);
    },
    release(binding) {
      releaseBinding(binding);
    },
    setAction(action, held) {
      if (held) {
        activeActionOverrides.add(action);
        record("press", action);
      } else {
        activeActionOverrides.delete(action);
        record("release", action);
      }
    },
    recorded() {
      return [...replayEvents];
    },
    replay(events, dt = 0) {
      activeBindings.clear();
      activeActionOverrides.clear();
      for (const event of events) {
        if (event.type === "press") pressBinding(event.binding, false);
        else releaseBinding(event.binding, false);
      }
      return update(dt);
    },
    clearReplay() {
      replayEvents.length = 0;
    },
    dispose() {
      if (target?.removeEventListener) {
        target.removeEventListener("keydown", onKeyDown);
        target.removeEventListener("keyup", onKeyUp);
        target.removeEventListener("pointerdown", onPointerDown);
        target.removeEventListener("pointermove", onPointerMove);
        target.removeEventListener("pointerup", onPointerUp);
        target.removeEventListener("touchstart", onTouchStart);
        target.removeEventListener("touchend", onTouchEnd);
        target.removeEventListener("touchcancel", onTouchEnd);
      }
      activeBindings.clear();
      activeActionOverrides.clear();
      previousHeld.clear();
      currentHeld.clear();
      pressedEdges.clear();
      releasedEdges.clear();
      gamepadBindings.clear();
      axisValues.clear();
      actionPressHistory.length = 0;
    }
  };
}

export function createGameKinematicBody(options: GameKinematicBodyOptions = {}): GameKinematicBody {
  let position = vec3(options.position, [0, options.groundY ?? 0, 0]);
  let velocity = vec3(options.velocity, [0, 0, 0]);
  const size = vec3(options.size ?? kinematicSizeFromCollider(options.collider), [0.72, 1.7, 0.42]);
  const gravity = typeof options.gravity === "boolean" ? (options.gravity ? -18 : 0) : options.gravity ?? -18;
  const groundY = options.groundY ?? 0;
  const friction = options.friction ?? 10;
  const maxSpeed = options.maxSpeed ?? 5;
  const jumpVelocity = options.jumpVelocity ?? 7.5;
  const bounds = options.bounds ?? {};
  const definedMoves = new Map<string, GameCombatMove>();
  let grounded = position[1] <= groundY + 0.0001;
  let facing: 1 | -1 = 1;
  let elapsed = 0;
  const coyoteSeconds = Math.max(0, options.coyoteMs ?? 0) / 1000;
  const jumpBufferSeconds = Math.max(0, options.jumpBufferMs ?? 0) / 1000;
  let lastGroundedAt = grounded ? 0 : Number.NEGATIVE_INFINITY;
  let lastJumpRequestedAt = Number.NEGATIVE_INFINITY;
  let jumpConsumed = false;

  const snapshot = (): GameKinematicBodySnapshot => ({
    kind: "aura-game-kinematic-body",
    id: options.id,
    position,
    velocity,
    size,
    collider: options.collider,
    grounded,
    facing,
    coyoteAvailable: canUseGroundedJump(),
    jumpBuffered: hasBufferedJump()
  });
  const hasBufferedJump = () => elapsed - lastJumpRequestedAt <= jumpBufferSeconds;
  const canUseGroundedJump = () => !jumpConsumed && (grounded || elapsed - lastGroundedAt <= coyoteSeconds);
  const startJump = (nextVelocity: number): boolean => {
    if (!canUseGroundedJump()) return false;
    grounded = false;
    jumpConsumed = true;
    lastJumpRequestedAt = Number.NEGATIVE_INFINITY;
    velocity = [velocity[0], nextVelocity, velocity[2]];
    return true;
  };
  const clampPosition = () => {
    position = [
      clamp(position[0], bounds.minX ?? Number.NEGATIVE_INFINITY, bounds.maxX ?? Number.POSITIVE_INFINITY),
      clamp(position[1], bounds.minY ?? Number.NEGATIVE_INFINITY, bounds.maxY ?? Number.POSITIVE_INFINITY),
      clamp(position[2], bounds.minZ ?? Number.NEGATIVE_INFINITY, bounds.maxZ ?? Number.POSITIVE_INFINITY)
    ];
  };
  const dashBody = (direction: GameVec3, speed = maxSpeed * 1.8): void => {
    const normalized = normalizeVec3(direction);
    velocity = [normalized[0] * speed, velocity[1], normalized[2] * speed];
    if (Math.abs(normalized[0]) > 0.01) facing = normalized[0] >= 0 ? 1 : -1;
  };
  const applyBodyKnockback = (nextVelocity: GameVec3): void => {
    velocity = addVec3(velocity, nextVelocity);
    if (Math.abs(nextVelocity[0]) > 0.01) facing = nextVelocity[0] >= 0 ? -1 : 1;
    grounded = false;
  };
  const updateBody = (dt: number): GameKinematicBodySnapshot => {
    const seconds = Math.max(0, dt);
    elapsed += seconds;
    if (!grounded || velocity[1] > 0) velocity = [velocity[0], velocity[1] + gravity * seconds, velocity[2]];
    position = addVec3(position, scaleVec3(velocity, seconds));
    if (position[1] <= groundY) {
      position = [position[0], groundY, position[2]];
      velocity = [velocity[0], Math.max(0, velocity[1]), velocity[2]];
      grounded = true;
      lastGroundedAt = elapsed;
      jumpConsumed = false;
    } else {
      grounded = false;
    }
    if (grounded && friction > 0) {
      const damping = Math.max(0, 1 - friction * seconds);
      velocity = [velocity[0] * damping, velocity[1], velocity[2] * damping];
    }
    clampPosition();
    return snapshot();
  };
  return {
    id: options.id,
    get position() {
      return position;
    },
    set position(next) {
      position = vec3(next, position);
      grounded = position[1] <= groundY + 0.0001;
      if (grounded) {
        lastGroundedAt = elapsed;
        jumpConsumed = false;
      }
    },
    get velocity() {
      return velocity;
    },
    set velocity(next) {
      velocity = vec3(next, velocity);
    },
    size,
    collider: options.collider,
    get grounded() {
      return grounded;
    },
    get facing() {
      return facing;
    },
    move(axisOrCommand, speedOrDt) {
      if (typeof axisOrCommand === "number") {
        const next = clamp(axisOrCommand, -1, 1);
        velocity = [next * (speedOrDt ?? maxSpeed), velocity[1], velocity[2]];
        if (Math.abs(next) > 0.01) facing = next >= 0 ? 1 : -1;
        return undefined;
      }
      const command = axisOrCommand;
      const horizontal =
        command.axis !== undefined
          ? clamp(command.axis, -1, 1) * (command.speed ?? maxSpeed)
          : command.x !== undefined
            ? clamp(command.x, -maxSpeed, maxSpeed)
            : velocity[0];
      velocity = [
        horizontal,
        command.y !== undefined ? command.y : velocity[1],
        command.z !== undefined ? clamp(command.z, -maxSpeed, maxSpeed) : velocity[2]
      ];
      if (Math.abs(horizontal) > 0.01) facing = horizontal >= 0 ? 1 : -1;
      if (command.jump) {
        lastJumpRequestedAt = elapsed;
        startJump(command.jumpVelocity ?? jumpVelocity);
      }
      if (command.dash) dashBody(typeof command.dash === "boolean" ? [facing, 0, 0] : command.dash, command.dashSpeed);
      if (command.knockback) {
        const knockback: GameVec3 =
          command.knockback.length === 2
            ? [command.knockback[0], command.knockback[1], 0]
            : command.knockback;
        applyBodyKnockback(knockback);
      }
      return speedOrDt !== undefined ? updateBody(speedOrDt) : snapshot();
    },
    jump(nextVelocity = jumpVelocity) {
      return startJump(nextVelocity);
    },
    requestJump() {
      lastJumpRequestedAt = elapsed;
    },
    canJump() {
      return canUseGroundedJump();
    },
    consumeJump(nextVelocity = jumpVelocity) {
      if (!hasBufferedJump()) return false;
      return startJump(nextVelocity);
    },
    dash(direction, speed = maxSpeed * 1.8) {
      dashBody(direction, speed);
    },
    applyKnockback(nextVelocity) {
      applyBodyKnockback(nextVelocity);
    },
    defineMove(id, move) {
      const nextMove: GameCombatMove = { ...move, id: move.id ?? id };
      definedMoves.set(id, nextMove);
      return nextMove;
    },
    attack(moveId) {
      return definedMoves.get(moveId);
    },
    moves() {
      return [...definedMoves.values()];
    },
    update: updateBody,
    snapToGround(nextGroundY = groundY) {
      position = [position[0], nextGroundY, position[2]];
      velocity = [velocity[0], Math.max(0, velocity[1]), velocity[2]];
      grounded = true;
      lastGroundedAt = elapsed;
      jumpConsumed = false;
    },
    bounds() {
      return aabb(position, size);
    },
    snapshot
  };
}

export function createGameFighting2DRules(options: GameFighting2DRulesOptions = {}): GameFighting2DRules {
  return {
    kind: "aura-game-fighting-2d-rules",
    gravity: options.gravity ?? 24,
    roundSeconds: options.roundSeconds ?? 90,
    maxHealth: options.maxHealth ?? 100,
    maxGuard: options.maxGuard ?? 100,
    maxMeter: options.maxMeter ?? 100,
    stageBounds: options.stageBounds ?? { minX: -4.5, maxX: 4.5, minZ: -0.72, maxZ: 0.72 },
    fps: options.fps ?? 60,
    pushboxSeparation: options.pushboxSeparation ?? true
  };
}

export function createCombatWorld(options: GameCombatWorldOptions = {}): GameCombatWorld {
  const actors = new Map<string, MutableCombatActor>();
  const fighterBodies = new Map<string, GameKinematicBody>();
  const moves = new Map<string, Map<string, GameCombatMove>>();
  const activeAttacks: MutableAttack[] = [];
  const rules = options.rules ?? createGameFighting2DRules();
  const stageBounds = options.stageBounds ?? rules.stageBounds;
  let events: GameCombatEvent[] = [];
  let frame = 0;
  let time = 0;

  const snapshot = (): GameCombatWorldSnapshot => ({
    kind: "aura-game-combat-world",
    frame,
    time,
    actors: [...actors.values()].map(actorSnapshot),
    activeAttacks: activeAttacks.map((attack) => {
      const activeFrames = moveActiveFrames(attack.move, rules.fps);
      const durationFrames = moveDurationFrames(attack.move, activeFrames, rules.fps);
      return {
        attackerId: attack.attackerId,
        moveId: attack.move.id,
        frame: attack.frame,
        activeFrames,
        durationFrames,
        active: attack.frame >= activeFrames[0] && attack.frame <= activeFrames[1],
        hitboxes: moveHitboxes(attack.move),
        hitTargets: [...attack.hitTargets].sort()
      };
    }),
    events: [...events]
  });
  const controller: GameCombatWorld = {
    addActor(actor) {
      const normalized = normalizeActor(actor);
      actors.set(actor.id, {
        ...normalized,
        health: actor.health ?? rules.maxHealth,
        guard: actor.guard ?? rules.maxGuard,
        meter: actor.meter ?? 0
      });
    },
    setActor(id, patch) {
      const actor = actors.get(id);
      if (!actor) {
        actors.set(id, normalizeActor({ id, ...patch }));
        return;
      }
      const stun = actor.stun;
      const recovery = actor.recovery;
      Object.assign(actor, normalizeActor({ ...actorSnapshot(actor), ...patch, id }));
      actor.stun = stun;
      actor.recovery = recovery;
    },
    removeActor(id) {
      actors.delete(id);
      fighterBodies.delete(id);
      moves.delete(id);
    },
    defineMove(actorId, move) {
      const actorMoves = moves.get(actorId) ?? new Map<string, GameCombatMove>();
      actorMoves.set(move.id, normalizeCombatMove(move));
      moves.set(actorId, actorMoves);
    },
    attack(attackerId, move) {
      const resolvedMove = typeof move === "string" ? moves.get(attackerId)?.get(move) ?? fighterBodies.get(attackerId)?.attack(move) : move;
      if (resolvedMove) this.beginAttack(attackerId, resolvedMove);
    },
    beginAttack(attackerId, move) {
      if (!actors.has(attackerId)) return;
      activeAttacks.push({ attackerId, move: normalizeCombatMove(move), frame: 0, hitTargets: new Set<string>() });
    },
    update(dt) {
      frame += 1;
      time += Math.max(0, dt);
      events = [];
      syncActorsFromBodies(fighterBodies, actors);
      for (const actor of actors.values()) {
        actor.stun = Math.max(0, actor.stun - 1);
        actor.recovery = Math.max(0, actor.recovery - 1);
      }
      if (rules.pushboxSeparation) resolvePushboxSeparation(actors, stageBounds, frame, time, events);
      for (let index = activeAttacks.length - 1; index >= 0; index -= 1) {
        const attack = activeAttacks[index];
        attack.frame += 1;
        const attacker = actors.get(attack.attackerId);
        if (!attacker) {
          activeAttacks.splice(index, 1);
          continue;
        }
        const [activeStart, activeEnd] = moveActiveFrames(attack.move, rules.fps);
        if (attack.frame >= activeStart && attack.frame <= activeEnd) {
          resolveAttack(attacker, attack, actors, stageBounds, frame, time, events);
        }
        if (attack.frame >= moveDurationFrames(attack.move, [activeStart, activeEnd], rules.fps)) {
          if (attack.hitTargets.size === 0) {
            events.push({
              type: "whiff",
              frame,
              time,
              attackerId: attacker.id,
              moveId: attack.move.id,
              position: attacker.position
            });
          }
          activeAttacks.splice(index, 1);
        }
      }
      syncBodiesFromActors(fighterBodies, actors);
      return snapshot();
    },
    step(dt) {
      return this.update(dt).events;
    },
    events() {
      return [...events];
    },
    consumeEvents() {
      const consumed = [...events];
      events = [];
      return consumed;
    },
    snapshot,
    clear() {
      actors.clear();
      activeAttacks.length = 0;
      events = [];
      frame = 0;
      time = 0;
    }
  };
  for (const [index, fighter] of (options.fighters ?? []).entries()) {
    if (isGameKinematicBody(fighter)) {
      const id = fighter.id ?? `fighter-${index + 1}`;
      fighterBodies.set(id, fighter);
      controller.addActor({ id, position: fighter.position, facing: fighter.facing });
      for (const move of fighter.moves()) controller.defineMove(id, move);
    } else {
      controller.addActor(fighter);
    }
  }
  return controller;
}

export function createGameCameraDirector(options: GameCameraDirectorOptions = {}): GameCameraDirector {
  const baseFov = options.baseFov ?? 42;
  const baseDistance = options.distance ?? 6.2;
  const targetY = options.targetY ?? 0.95;
  const minZoom = options.minZoom ?? 0.86;
  const maxZoom = options.maxZoom ?? 1.24;
  const reducedMotion = options.reducedMotion ?? false;
  const mode = options.mode ?? "side-fighter";
  const stageBounds = options.stageBounds ?? options.bounds;
  const impactShake = options.impactShake ?? true;
  let state: GameCameraSnapshot = {
    kind: "aura-game-camera-director",
    position: [0, 1.35, baseDistance],
    target: [0, targetY, 0],
    fov: baseFov,
    zoom: 1,
    shake: 0,
    reducedMotion,
    mode,
    targetIds: options.targetIds
  };
  let shakeRemaining = 0;
  let shakeIntensity = 0;
  let specialRemaining = 0;
  let specialTarget: GameVec3 | undefined;
  return {
    update(dt, targets) {
      const seconds = Math.max(0, dt);
      shakeRemaining = Math.max(0, shakeRemaining - seconds);
      specialRemaining = Math.max(0, specialRemaining - seconds);
      const positions = targets.length ? targets.map((target) => target.position) : [state.target];
      const minX = Math.min(...positions.map((position) => position[0]));
      const maxX = Math.max(...positions.map((position) => position[0]));
      const centerX = clamp((minX + maxX) / 2, stageBounds?.minX ?? -100, stageBounds?.maxX ?? 100);
      const distance = Math.max(1, maxX - minX);
      const zoom = clamp(1 + (distance - 2.2) * 0.08, minZoom, maxZoom);
      const focus = specialRemaining > 0 && specialTarget ? specialTarget : [centerX, targetY, 0] as const;
      const shake = reducedMotion ? 0 : shakeRemaining > 0 ? shakeIntensity * (shakeRemaining / Math.max(0.001, shakeRemaining + seconds)) : 0;
      state = {
        kind: "aura-game-camera-director",
        target: focus,
        position: [focus[0] + shake * 0.04, focus[1] + 0.42 + shake * 0.02, baseDistance * zoom],
        fov: baseFov / zoom,
        zoom,
        shake,
        reducedMotion,
        mode,
        targetIds: options.targetIds ?? targets.map((target) => target.id).filter((id): id is string => Boolean(id))
      };
      return state;
    },
    impact(intensity = 1, duration = 0.16) {
      if (reducedMotion || !impactShake) return;
      shakeIntensity = Math.max(shakeIntensity, intensity);
      shakeRemaining = Math.max(shakeRemaining, duration);
    },
    special(target, duration = 0.8) {
      specialTarget = target;
      specialRemaining = duration;
    },
    snapshot() {
      return state;
    }
  };
}

export function createGameEffects(options: GameEffectsOptions = {}): GameEffectsController {
  const poolSize = options.poolSize ?? 96;
  const reducedMotion = options.reducedMotion ?? false;
  const reducedFlash = options.reducedFlash ?? false;
  let spawned = 0;
  let effects: MutableGameEffectInstance[] = [];
  const snapshot = (): GameEffectsSnapshot => ({
    kind: "aura-game-effects",
    active: effects.length,
    spawned,
    pooled: poolSize,
    reducedMotion,
    reducedFlash,
    effects: effects.map(publicGameEffectInstance)
  });
  const spawn = (kind: GameEffectKind, position: GameVec3, effectOptions: GameEffectOptions = {}): GameEffectInstance => {
    spawned += 1;
    const flashLimited = reducedFlash && (kind === "impact-flash" || kind === "super-flash");
    const motionLimited = reducedMotion && (kind === "dash-trail" || kind === "slash-trail" || kind === "shockwave" || kind === "ring-shockwave");
    const attachment = effectOptions.attachment;
    const effect: MutableGameEffectInstance = {
      id: effectOptions.ownerId ? `${effectOptions.ownerId}:${kind}:${spawned}` : `${kind}:${spawned}`,
      kind,
      position: resolveEffectAttachmentPosition(attachment, position),
      color: effectOptions.color ?? defaultEffectColor(kind),
      intensity: Math.min(effectOptions.intensity ?? 1, flashLimited ? 0.35 : motionLimited ? 0.55 : Number.POSITIVE_INFINITY),
      duration: Math.min(effectOptions.duration ?? defaultEffectDuration(kind), motionLimited ? 0.18 : Number.POSITIVE_INFINITY),
      radius: effectOptions.radius ?? defaultEffectRadius(kind),
      ownerId: effectOptions.ownerId,
      attachmentId: attachment?.targetId ?? attachment?.id,
      attachmentOffset: attachment?.offset,
      attachment,
      age: 0
    };
    if (effects.length >= poolSize) effects.shift();
    effects.push(effect);
    return publicGameEffectInstance(effect);
  };
  return {
    spawn,
    emit(combatEvents, effectOptions) {
      const emitted: GameEffectInstance[] = [];
      for (const event of combatEvents) {
        if (event.type === "hit") emitted.push(spawn("hit-spark", event.position, { ownerId: event.attackerId, ...effectOptions }));
        if (event.type === "blocked") emitted.push(spawn("block-spark", event.position, { ownerId: event.attackerId, ...effectOptions }));
        if (event.type === "push") emitted.push(spawn("ground-dust", event.position, { ownerId: event.attackerId, intensity: 0.45, duration: 0.14, ...effectOptions }));
      }
      return emitted;
    },
    hitSpark: (position, effectOptions) => spawn("hit-spark", position, effectOptions),
    blockSpark: (position, effectOptions) => spawn("block-spark", position, effectOptions),
    impactDecal: (position, effectOptions) => spawn("impact-decal", position, effectOptions),
    groundDust: (position, effectOptions) => spawn("ground-dust", position, effectOptions),
    dashTrail: (position, effectOptions) => spawn("dash-trail", position, effectOptions),
    slashTrail: (position, effectOptions) => spawn("slash-trail", position, effectOptions),
    impactFlash: (position, effectOptions) => spawn("impact-flash", position, effectOptions),
    auraBurst: (position, effectOptions) => spawn("aura-burst", position, effectOptions),
    shockwave: (position, effectOptions) => spawn("shockwave", position, effectOptions),
    ringShockwave: (position, effectOptions) => spawn("ring-shockwave", position, effectOptions),
    superFlash: (position, effectOptions) => spawn("super-flash", position, effectOptions),
    update(dt) {
      const seconds = Math.max(0, dt);
      effects = effects
        .map((effect) => ({
          ...effect,
          position: resolveEffectAttachmentPosition(effect.attachment, effect.position),
          age: effect.age + seconds
        }))
        .filter((effect) => effect.age <= effect.duration);
      return snapshot();
    },
    snapshot,
    nodes() {
      return effects.map(effectToSceneNode);
    },
    clear() {
      effects = [];
    }
  };
}

export function applyGameCombatEventsToRuntime(
  events: readonly GameCombatEvent[],
  options: GameCombatEventRuntimeBridgeOptions = {}
): GameCombatEventRuntimeBridgeResult {
  const effectIds: string[] = [];
  let cameraImpacts = 0;
  for (const event of events) {
    if (event.type === "hit") {
      const effect = options.effects?.hitSpark(event.position, { ownerId: event.attackerId });
      if (effect) effectIds.push(effect.id);
      options.camera?.impact(1.1);
      if (options.camera) cameraImpacts += 1;
    } else if (event.type === "blocked") {
      const effect = options.effects?.blockSpark(event.position, { ownerId: event.attackerId });
      if (effect) effectIds.push(effect.id);
      options.camera?.impact(0.55);
      if (options.camera) cameraImpacts += 1;
    } else if (event.type === "push") {
      const effect = options.effects?.groundDust(event.position, { ownerId: event.attackerId, intensity: 0.45, duration: 0.14 });
      if (effect) effectIds.push(effect.id);
    }
  }
  const hud =
    options.hudBindings && options.combat
      ? createGameHudSnapshot({
        bindings: options.hudBindings,
        combat: options.combat,
        events,
        round: options.round,
        rules: options.rules,
        input: options.input,
        runtime: options.runtime,
        debug: options.debug,
        appState: options.appState
      })
      : undefined;
  return {
    kind: "aura-game-combat-event-runtime-bridge",
    events: [...events],
    effectIds,
    cameraImpacts,
    hud
  };
}

export function createGameBoxCollider(options: GameBoxColliderOptions = {}): GameBoxCollider {
  const size = size3(options.size, [
    options.width ?? 1,
    options.height ?? 1,
    options.depth ?? (options.dimension === 2 ? 0 : 1)
  ]);
  return {
    ...colliderBase(options, size[2] === 0 ? 2 : 3),
    kind: "box",
    size
  };
}

export function createGameSphereCollider(options: GameSphereColliderOptions = {}): GameSphereCollider {
  const radius = Math.max(0, options.radius ?? 0.5);
  return {
    ...colliderBase(options, options.dimension ?? 3),
    kind: "sphere",
    radius
  };
}

export function createGameCapsuleCollider(options: GameCapsuleColliderOptions = {}): GameCapsuleCollider {
  return {
    ...colliderBase(options, options.dimension ?? 3),
    kind: "capsule",
    radius: Math.max(0, options.radius ?? 0.35),
    height: Math.max(0, options.height ?? 1.7),
    axis: options.axis ?? "y"
  };
}

export function createGameRectCollider(options: GameRectColliderOptions = {}): GameRectCollider {
  return {
    ...colliderBase(options, 2),
    kind: "rect",
    size: vec2(options.size, [options.width ?? 1, options.height ?? 1]),
    plane: options.plane ?? "xy"
  };
}

export const gameColliders = {
  box: createGameBoxCollider,
  sphere: createGameSphereCollider,
  capsule: createGameCapsuleCollider,
  rect: createGameRectCollider
} as const;

export function createGameCollisionBox(options: GameCollisionBoxFactoryOptions = {}, tag = "hitbox"): GameCollisionBox {
  const size = size3(options.size, [options.width ?? 1, options.height ?? 1, options.depth ?? 0.5]);
  return {
    id: options.id,
    offset: vec3Flexible(options.offset, [0, 0, 0]),
    center: options.center ? vec3Flexible(options.center, [0, 0, 0]) : undefined,
    size,
    tags: [...(options.tags ?? []), tag]
  };
}

export function createGameHitboxRect(options: GameCollisionBoxFactoryOptions = {}): GameCollisionBox {
  return createGameCollisionBox(options, "hitbox");
}

export function createGameHurtboxRect(options: GameCollisionBoxFactoryOptions = {}): GameCollisionBox {
  return createGameCollisionBox(options, "hurtbox");
}

export function createGameGuardboxRect(options: GameCollisionBoxFactoryOptions = {}): GameCollisionBox {
  return createGameCollisionBox(options, "guardbox");
}

export function createGamePushboxRect(options: GameCollisionBoxFactoryOptions = {}): GameCollisionBox {
  return createGameCollisionBox(options, "pushbox");
}

export const gameHitboxes = {
  rect: createGameHitboxRect,
  box: createGameHitboxRect
} as const;

export const gameHurtboxes = {
  rect: createGameHurtboxRect,
  box: createGameHurtboxRect
} as const;

export const gameGuardboxes = {
  rect: createGameGuardboxRect,
  box: createGameGuardboxRect
} as const;

export const gamePushboxes = {
  rect: createGamePushboxRect,
  box: createGamePushboxRect
} as const;

export const gameTriggerVolumes = {
  box: (options: GameBoxColliderOptions = {}): GameBoxCollider => createGameBoxCollider({ ...options, sensor: true, tags: [...(options.tags ?? []), "trigger"] }),
  sphere: (options: GameSphereColliderOptions = {}): GameSphereCollider => createGameSphereCollider({ ...options, sensor: true, tags: [...(options.tags ?? []), "trigger"] }),
  capsule: (options: GameCapsuleColliderOptions = {}): GameCapsuleCollider => createGameCapsuleCollider({ ...options, sensor: true, tags: [...(options.tags ?? []), "trigger"] }),
  rect: (options: GameRectColliderOptions = {}): GameRectCollider => createGameRectCollider({ ...options, sensor: true, tags: [...(options.tags ?? []), "trigger"] })
} as const;

export const gameEffectPresets = {
  hitSpark: (options: GameEffectOptions = {}): GameEffectPreset => ({ kind: "hit-spark", options }),
  blockSpark: (options: GameEffectOptions = {}): GameEffectPreset => ({ kind: "block-spark", options }),
  groundDust: (options: GameEffectOptions = {}): GameEffectPreset => ({ kind: "ground-dust", options }),
  dashTrail: (options: GameEffectOptions = {}): GameEffectPreset => ({ kind: "dash-trail", options }),
  slashTrail: (options: GameEffectOptions = {}): GameEffectPreset => ({ kind: "slash-trail", options }),
  shockwave: (options: GameEffectOptions = {}): GameEffectPreset => ({ kind: "shockwave", options }),
  auraBurst: (options: GameEffectOptions = {}): GameEffectPreset => ({ kind: "aura-burst", options }),
  superBurst: (options: GameEffectOptions = {}): GameEffectPreset => ({ kind: "super-flash", options })
} as const;

export function gameColliderAabb(collider: GameCollider): GameAabb {
  if (collider.kind === "box") return aabb(collider.center, collider.size);
  if (collider.kind === "sphere") {
    const diameter = collider.radius * 2;
    return aabb(collider.center, [diameter, diameter, collider.dimension === 2 ? 0 : diameter]);
  }
  if (collider.kind === "capsule") {
    const diameter = collider.radius * 2;
    const size: GameVec3 =
      collider.axis === "x"
        ? [collider.height, diameter, collider.dimension === 2 ? 0 : diameter]
        : collider.axis === "z"
          ? [diameter, diameter, collider.height]
          : [diameter, collider.height, collider.dimension === 2 ? 0 : diameter];
    return aabb(collider.center, size);
  }
  const size: GameVec3 =
    collider.plane === "xz"
      ? [collider.size[0], 0, collider.size[1]]
      : collider.plane === "yz"
        ? [0, collider.size[0], collider.size[1]]
        : [collider.size[0], collider.size[1], 0];
  return aabb(collider.center, size);
}

export function createGameColliderDebugGeometry(
  colliders: readonly GameCollider[],
  options: GameDebugGeometryOptions = {}
): readonly GameDebugGeometryNode[] {
  return colliders.map((collider, index) => debugGeometryFromCollider(collider, options, index));
}

export function createGameHitboxDebugGeometry(
  hitboxes: readonly GameCollisionBox[],
  options: GameDebugGeometryOptions = {}
): readonly GameDebugGeometryNode[] {
  const origin = vec3(options.origin, [0, 0, 0]);
  const facing = options.facing ?? 1;
  const mirrorX = options.mirrorX ?? true;
  return hitboxes.map((hitbox, index) => {
    const offset = vec3(hitbox.offset ?? hitbox.center, [0, 0, 0]);
    const center = addVec3(origin, [offset[0] * (mirrorX ? facing : 1), offset[1], offset[2]]);
    return debugGeometryFromCollider(
      createGameBoxCollider({
        id: hitbox.id,
        center,
        size: hitbox.size,
        tags: hitbox.tags,
        dimension: hitbox.size[2] === 0 ? 2 : 3
      }),
      { color: "#ff5c8a", source: "hitbox", ...options },
      index
    );
  });
}

export function createGameCombatDebugGeometry(
  snapshot: GameCombatWorldSnapshot,
  options: GameDebugGeometryOptions = {}
): readonly GameDebugGeometryNode[] {
  const nodes: GameDebugGeometryNode[] = [];
  for (const actor of snapshot.actors) {
    nodes.push(
      ...createGameHitboxDebugGeometry(actor.hurtboxes, {
        color: "#47d16c",
        source: `${actor.id}:hurtbox`,
        origin: actor.position,
        facing: actor.facing,
        ...options
      })
    );
    nodes.push(
      ...createGameHitboxDebugGeometry(actor.guardboxes, {
        color: "#5cc8ff",
        source: `${actor.id}:guardbox`,
        origin: actor.position,
        facing: actor.facing,
        ...options
      })
    );
    nodes.push(
      ...createGameHitboxDebugGeometry(actor.pushboxes, {
        color: "#ffd166",
        source: `${actor.id}:pushbox`,
        origin: actor.position,
        facing: actor.facing,
        ...options
      })
    );
  }
  for (const attack of snapshot.activeAttacks) {
    const actor = snapshot.actors.find((candidate) => candidate.id === attack.attackerId);
    if (!actor) continue;
    const source = `${attack.attackerId}:${attack.moveId}:${attack.active ? "active-hitbox" : "inactive-hitbox"}`;
    const activeTags = [
      "attack-hitbox",
      attack.active ? "active-frame" : "inactive-frame",
      `move:${attack.moveId}`,
      `frame:${attack.frame}`,
      `active:${attack.activeFrames[0]}-${attack.activeFrames[1]}`
    ];
    nodes.push(
      ...createGameHitboxDebugGeometry(attack.hitboxes, {
        color: attack.active ? "#ff5c8a" : "#7c2d12",
        source,
        origin: actor.position,
        facing: actor.facing,
        ...options
      }).map((node) => ({
        ...node,
        tags: [...node.tags, ...activeTags]
      }))
    );
  }
  snapshot.events.forEach((event, index) => {
    nodes.push(
      debugGeometryFromCollider(
        createGameSphereCollider({
          id: `contact:${event.frame}:${event.attackerId}:${event.targetId ?? "none"}:${index}`,
          center: event.position,
          radius: event.type === "hit" || event.type === "blocked" ? 0.075 : 0.045,
          tags: ["contact-point", `event:${event.type}`, `attacker:${event.attackerId}`, event.targetId ? `target:${event.targetId}` : "target:none"]
        }),
        {
          color: event.type === "blocked" ? "#5cc8ff" : event.type === "hit" ? "#ffffff" : "#ffd166",
          opacity: 0.82,
          wireframe: false,
          source: `contact:${event.type}`,
          ...options
        },
        index
      )
    );
  });
  return nodes;
}

export function createGameDebugOverlayData(options: GameDebugOverlayOptions = {}): GameDebugOverlayData {
  const inputSnapshot =
    options.input && "kind" in options.input && options.input.kind === "aura-game-input-snapshot"
      ? options.input
      : options.input && "snapshot" in options.input
        ? options.input.snapshot()
        : undefined;
  const bodySnapshots = options.bodySnapshots ?? options.bodies?.map((body) => body.snapshot()) ?? [];
  const combatSnapshot =
    options.combat && "kind" in options.combat && options.combat.kind === "aura-game-combat-world"
      ? options.combat
      : options.combat && "snapshot" in options.combat
        ? options.combat.snapshot()
        : undefined;
  const effectsSnapshot =
    options.effects && "kind" in options.effects && options.effects.kind === "aura-game-effects"
      ? options.effects
      : options.effects && "snapshot" in options.effects
        ? options.effects.snapshot()
        : undefined;
  const cameraSnapshot =
    options.camera && "kind" in options.camera && options.camera.kind === "aura-game-camera-director"
      ? options.camera
      : options.camera && "snapshot" in options.camera
        ? options.camera.snapshot()
        : undefined;
  const sections: GameDebugOverlaySection[] = [];
  if (options.runtime) {
    sections.push({
      id: "runtime",
      title: "Runtime",
      metrics: [
        { id: "frame", label: "Frame", value: options.runtime.frame },
        { id: "time", label: "Time", value: round(options.runtime.time, 3) },
        { id: "paused", label: "Paused", value: options.runtime.paused ?? false }
      ]
    });
  }
  if (inputSnapshot) {
    sections.push({
      id: "input",
      title: "Input",
      metrics: [
        { id: "inputFrame", label: "Input frame", value: inputSnapshot.frame },
        { id: "bindings", label: "Active bindings", value: inputSnapshot.activeBindings.join(", ") || "none" },
        { id: "actions", label: "Held actions", value: Object.entries(inputSnapshot.actions).filter(([, state]) => state.held).map(([action]) => action).join(", ") || "none" }
      ]
    });
  }
  if (bodySnapshots.length) {
    sections.push({
      id: "physics",
      title: "Physics",
      metrics: [
        { id: "bodies", label: "Bodies", value: bodySnapshots.length },
        { id: "grounded", label: "Grounded", value: bodySnapshots.filter((body) => body.grounded).length },
        { id: "bufferedJumps", label: "Buffered jumps", value: bodySnapshots.filter((body) => body.jumpBuffered).length }
      ]
    });
  }
  if (combatSnapshot) {
    sections.push({
      id: "combat",
      title: "Combat",
      metrics: [
        { id: "actors", label: "Actors", value: combatSnapshot.actors.length },
        { id: "activeAttacks", label: "Active attacks", value: combatSnapshot.activeAttacks.length },
        { id: "activeFrames", label: "Active frames", value: combatSnapshot.activeAttacks.filter((attack) => attack.active).map((attack) => `${attack.moveId}:${attack.frame}/${attack.activeFrames[0]}-${attack.activeFrames[1]}`).join(", ") || "none" },
        { id: "contactPoints", label: "Contact points", value: combatSnapshot.events.filter((event) => event.type === "hit" || event.type === "blocked" || event.type === "push").length },
        { id: "events", label: "Events", value: combatSnapshot.events.length }
      ]
    });
  }
  if (effectsSnapshot) {
    sections.push({
      id: "effects",
      title: "Effects",
      metrics: [
        { id: "active", label: "Active", value: effectsSnapshot.active },
        { id: "spawned", label: "Spawned", value: effectsSnapshot.spawned },
        { id: "pooled", label: "Pool", value: effectsSnapshot.pooled }
      ]
    });
  }
  if (cameraSnapshot) {
    sections.push({
      id: "camera",
      title: "Camera",
      metrics: [
        { id: "fov", label: "FOV", value: round(cameraSnapshot.fov, 2) },
        { id: "zoom", label: "Zoom", value: round(cameraSnapshot.zoom, 3) },
        { id: "shake", label: "Shake", value: round(cameraSnapshot.shake, 3) }
      ]
    });
  }
  const geometry = [
    ...createGameColliderDebugGeometry(options.colliders ?? [], { source: "collider" }),
    ...createGameHitboxDebugGeometry(options.hitboxes ?? [], { source: "hitbox" }),
    ...(combatSnapshot ? createGameCombatDebugGeometry(combatSnapshot) : [])
  ];
  return {
    kind: "aura-game-debug-overlay",
    frame: options.runtime?.frame ?? inputSnapshot?.frame ?? combatSnapshot?.frame ?? 0,
    time: options.runtime?.time ?? inputSnapshot?.time ?? combatSnapshot?.time ?? 0,
    paused: options.runtime?.paused ?? false,
    sections,
    geometry,
    labels: options.labels ?? {},
    warnings: options.warnings ?? []
  };
}

export function createGameDebugSceneNodes(
  debug: GameDebugOverlayData | readonly GameDebugGeometryNode[],
  options: GameDebugSceneNodeOptions = {}
): readonly GameDebugSceneNode[] {
  const geometry: readonly GameDebugGeometryNode[] = Array.isArray(debug)
    ? debug
    : (debug as GameDebugOverlayData).geometry;
  const runtimePrefix = options.runtimePrefix ?? "debug";
  const primitives: GameDebugSceneNode[] = geometry.map((node: GameDebugGeometryNode) => ({
    kind: "primitive",
    primitive: debugScenePrimitive(node.primitive),
    name: `${runtimePrefix}:${node.id}`,
    position: node.position,
    scale: debugSceneScale(node),
    material: {
      color: node.color,
      emissive: node.color,
      emissiveIntensity: node.tags.includes("contact-point") ? 0.95 : 0.38,
      opacity: node.opacity,
      transparent: node.opacity < 1,
      wireframe: node.wireframe
    },
    runtime: {
      id: `${runtimePrefix}:${node.id}`,
      mutable: true,
      tags: ["debug", "game-runtime", node.source, ...node.tags]
    },
    debug: {
      source: node.source,
      tags: node.tags,
      aabb: node.aabb
    }
  }));
  if (!options.includeLabels) return primitives;
  const labels: GameDebugSceneNode[] = geometry
    .filter((node: GameDebugGeometryNode) => node.tags.includes("active-frame") || node.tags.includes("contact-point"))
    .map((node: GameDebugGeometryNode) => ({
      kind: "label",
      name: `${runtimePrefix}:${node.id}:label`,
      position: [node.position[0], node.position[1] + Math.max(0.08, node.scale[1] * 0.5 + 0.08), node.position[2]] as GameVec3,
      text: node.tags.includes("contact-point") ? node.source : `${node.source} ${node.tags.find((tag) => tag.startsWith("frame:")) ?? ""}`.trim(),
      color: node.color,
      background: "#07111f",
      size: 0.12,
      runtime: {
        id: `${runtimePrefix}:${node.id}:label`,
        mutable: true,
        tags: ["debug", "game-runtime", "label", node.source, ...node.tags]
      },
      debug: {
        source: node.source,
        tags: node.tags,
        aabb: node.aabb
      }
    }));
  return [...primitives, ...labels];
}

interface MutableCombatActor {
  id: string;
  team: string;
  position: GameVec3;
  facing: 1 | -1;
  health: number;
  guard: number;
  meter: number;
  hurtboxes: readonly GameCollisionBox[];
  guardboxes: readonly GameCollisionBox[];
  pushboxes: readonly GameCollisionBox[];
  guarding: boolean;
  stun: number;
  recovery: number;
}

interface MutableAttack {
  readonly attackerId: string;
  readonly move: GameCombatMove;
  frame: number;
  readonly hitTargets: Set<string>;
}

type MutableGameEffectInstance = Omit<GameEffectInstance, "age" | "attachment"> & {
  age: number;
  readonly attachment?: GameEffectAttachment;
};

function publicGameEffectInstance(effect: MutableGameEffectInstance): GameEffectInstance {
  const { attachment: _attachment, ...publicEffect } = effect;
  return { ...publicEffect };
}

function resolveEffectAttachmentPosition(attachment: GameEffectAttachment | undefined, fallback: GameVec3): GameVec3 {
  if (!attachment?.getPosition) return fallback;
  return addVec3(attachment.getPosition(), vec3(attachment.offset, [0, 0, 0]));
}

function normalizeActor(actor: GameCombatActorOptions): MutableCombatActor {
  return {
    id: actor.id,
    team: actor.team ?? actor.id,
    position: vec3(actor.position, [0, 0, 0]),
    facing: actor.facing ?? 1,
    health: actor.health ?? 100,
    guard: actor.guard ?? 100,
    meter: actor.meter ?? 0,
    hurtboxes: actor.hurtboxes ?? [{ id: "body", offset: [0, 0.85, 0], size: [0.62, 1.55, 0.48] }],
    guardboxes: actor.guardboxes ?? [{ id: "guard", offset: [0.22, 0.92, 0], size: [0.54, 1.35, 0.54] }],
    pushboxes: actor.pushboxes ?? [{ id: "push", offset: [0, 0.72, 0], size: [0.72, 1.2, 0.52] }],
    guarding: actor.guarding ?? false,
    stun: 0,
    recovery: 0
  };
}

function normalizeCombatMove(move: GameCombatMove): GameCombatMove {
  return {
    ...move,
    hitboxes: moveHitboxes(move)
  };
}

function moveHitboxes(move: GameCombatMove): readonly GameCollisionBox[] {
  return move.hitboxes ?? (move.hitbox ? [move.hitbox] : []);
}

function moveActiveFrames(move: GameCombatMove, fps: number): readonly [number, number] {
  if (move.activeFrames) return move.activeFrames;
  if (move.startup !== undefined || move.active !== undefined) {
    const startupFrames = Math.max(0, Math.round((move.startup ?? 0) * fps));
    const activeFrames = Math.max(1, Math.round((move.active ?? 1 / fps) * fps));
    return [startupFrames + 1, startupFrames + activeFrames];
  }
  return [1, move.durationFrames ?? 12];
}

function moveDurationFrames(move: GameCombatMove, activeFrames: readonly [number, number], fps: number): number {
  if (move.durationFrames !== undefined) return move.durationFrames;
  const secondsMode = move.startup !== undefined || move.active !== undefined;
  const recoveryFrames = secondsMode ? Math.max(0, Math.round((move.recovery ?? 0) * fps)) : move.recovery ?? 8;
  return activeFrames[1] + recoveryFrames;
}

function isGameKinematicBody(fighter: GameKinematicBody | GameCombatActorOptions): fighter is GameKinematicBody {
  return typeof (fighter as GameKinematicBody).update === "function" && typeof (fighter as GameKinematicBody).snapshot === "function";
}

function syncActorsFromBodies(bodies: Map<string, GameKinematicBody>, actors: Map<string, MutableCombatActor>): void {
  for (const [id, body] of bodies) {
    const actor = actors.get(id);
    if (!actor) continue;
    actor.position = body.position;
    actor.facing = body.facing;
  }
}

function syncBodiesFromActors(bodies: Map<string, GameKinematicBody>, actors: Map<string, MutableCombatActor>): void {
  for (const [id, body] of bodies) {
    const actor = actors.get(id);
    if (actor) body.position = actor.position;
  }
}

function resolvePushboxSeparation(
  actors: Map<string, MutableCombatActor>,
  stageBounds: GameBounds3,
  frame: number,
  time: number,
  events: GameCombatEvent[]
): void {
  const actorList = [...actors.values()];
  for (let leftIndex = 0; leftIndex < actorList.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < actorList.length; rightIndex += 1) {
      const left = actorList[leftIndex];
      const right = actorList[rightIndex];
      if (!left || !right || left.team === right.team) continue;
      const leftBox = left.pushboxes[0] ? worldBox(left, left.pushboxes[0], false) : undefined;
      const rightBox = right.pushboxes[0] ? worldBox(right, right.pushboxes[0], false) : undefined;
      if (!leftBox || !rightBox || !intersects(leftBox, rightBox)) continue;
      const overlap = Math.min(leftBox.max[0] - rightBox.min[0], rightBox.max[0] - leftBox.min[0]);
      if (overlap <= 0) continue;
      const direction = left.position[0] <= right.position[0] ? -1 : 1;
      left.position = clampVec3ToBounds([left.position[0] + direction * overlap * 0.5, left.position[1], left.position[2]], stageBounds);
      right.position = clampVec3ToBounds([right.position[0] - direction * overlap * 0.5, right.position[1], right.position[2]], stageBounds);
      events.push({
        type: "push",
        frame,
        time,
        attackerId: left.id,
        targetId: right.id,
        position: [(left.position[0] + right.position[0]) / 2, (left.position[1] + right.position[1]) / 2 + 0.72, (left.position[2] + right.position[2]) / 2]
      });
    }
  }
}

function actorSnapshot(actor: MutableCombatActor): GameCombatActorSnapshot {
  return {
    id: actor.id,
    team: actor.team,
    position: actor.position,
    facing: actor.facing,
    health: actor.health,
    guard: actor.guard,
    meter: actor.meter,
    hurtboxes: actor.hurtboxes,
    guardboxes: actor.guardboxes,
    pushboxes: actor.pushboxes,
    guarding: actor.guarding,
    stun: actor.stun,
    recovery: actor.recovery
  };
}

function resolveAttack(
  attacker: MutableCombatActor,
  attack: MutableAttack,
  actors: Map<string, MutableCombatActor>,
  stageBounds: GameBounds3,
  frame: number,
  time: number,
  events: GameCombatEvent[]
): void {
  for (const target of actors.values()) {
    if (target.id === attacker.id || target.team === attacker.team || attack.hitTargets.has(target.id)) continue;
    for (const hitbox of moveHitboxes(attack.move)) {
      const worldHitbox = worldBox(attacker, hitbox, true);
      const guarded =
        target.guarding &&
        attack.move.blockable !== false &&
        target.guardboxes.some((guardbox) => intersects(worldHitbox, worldBox(target, guardbox, false)));
      const hurt = target.hurtboxes.some((hurtbox) => intersects(worldHitbox, worldBox(target, hurtbox, false)));
      if (!guarded && !hurt) continue;
      attack.hitTargets.add(target.id);
      const position: GameVec3 = [
        (attacker.position[0] + target.position[0]) / 2,
        (attacker.position[1] + target.position[1]) / 2 + 0.9,
        (attacker.position[2] + target.position[2]) / 2
      ];
      if (guarded) {
        const guardDamage = attack.move.guardDamage ?? Math.ceil((attack.move.damage ?? 8) * 0.4);
        target.guard = Math.max(0, target.guard - guardDamage);
        target.stun = Math.max(target.stun, attack.move.blockStun ?? 8);
        events.push({
          type: "blocked",
          frame,
          time,
          attackerId: attacker.id,
          targetId: target.id,
          moveId: attack.move.id,
          guardDamage,
          hitStop: attack.move.hitStop ?? 0.045,
          stun: target.stun,
          position
        });
      } else {
        const damage = attack.move.damage ?? 8;
        const baseKnockback = vec3Flexible(attack.move.knockback, [0.08, 0, 0]);
        const knockback: GameVec3 = [baseKnockback[0] * attacker.facing, baseKnockback[1], baseKnockback[2]];
        target.health = Math.max(0, target.health - damage);
        target.stun = Math.max(target.stun, attack.move.hitStun ?? 12);
        target.recovery = Math.max(target.recovery, attack.move.recovery ?? 8);
        target.position = clampVec3ToBounds(addVec3(target.position, knockback), stageBounds);
        attacker.meter += attack.move.meterGain ?? damage * 0.15;
        events.push({
          type: "hit",
          frame,
          time,
          attackerId: attacker.id,
          targetId: target.id,
          moveId: attack.move.id,
          damage,
          hitStop: attack.move.hitStop ?? 0.06,
          stun: target.stun,
          knockback,
          position
        });
      }
      return;
    }
  }
}

function worldBox(actor: MutableCombatActor, box: GameCollisionBox, mirrorX: boolean): GameAabb {
  const offset = vec3(box.offset ?? box.center, [0, 0, 0]);
  const signedOffset: GameVec3 = [offset[0] * (mirrorX ? actor.facing : 1), offset[1], offset[2]];
  return aabb(addVec3(actor.position, signedOffset), box.size);
}

function normalizeReplayEvents(events: readonly GameInputReplayEvent[]): readonly GameInputReplayEvent[] {
  return [...events]
    .map((event) => ({
      frame: Math.max(0, Math.floor(event.frame)),
      time: Math.max(0, event.time),
      type: event.type,
      binding: event.binding
    }))
    .sort((a, b) => a.frame - b.frame || a.time - b.time || a.binding.localeCompare(b.binding) || a.type.localeCompare(b.type));
}

function replayChecksum(events: readonly GameInputReplayEvent[], seed: number, fps: number): string {
  let hash = 2166136261 ^ seed ^ Math.floor(fps * 1000);
  for (const event of events) {
    const chunk = `${event.frame}:${event.time.toFixed(6)}:${event.type}:${event.binding}`;
    for (let index = 0; index < chunk.length; index += 1) {
      hash ^= chunk.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function colliderBase(options: GameColliderFactoryOptions, fallbackDimension: GameColliderDimension): Omit<GameColliderBase, "kind"> {
  return {
    id: options.id,
    center: vec3(options.center ?? options.offset, [0, 0, 0]),
    offset: options.offset,
    tags: options.tags ?? [],
    dimension: options.dimension ?? fallbackDimension,
    sensor: options.sensor ?? false
  };
}

function debugGeometryFromCollider(
  collider: GameCollider,
  options: GameDebugGeometryOptions,
  index: number
): GameDebugGeometryNode {
  const aabbBox = gameColliderAabb(collider);
  return {
    kind: "aura-game-debug-geometry",
    id: collider.id ?? `${options.source ?? collider.kind}:${index}`,
    primitive: collider.kind,
    position: collider.center,
    scale: debugGeometryScale(collider),
    radius: collider.kind === "sphere" || collider.kind === "capsule" ? collider.radius : undefined,
    height: collider.kind === "capsule" ? collider.height : undefined,
    axis: collider.kind === "capsule" ? collider.axis : undefined,
    plane: collider.kind === "rect" ? collider.plane : undefined,
    color: options.color ?? defaultDebugColor(options.source ?? collider.kind),
    opacity: options.opacity ?? 0.35,
    wireframe: options.wireframe ?? true,
    source: options.source ?? collider.kind,
    tags: collider.tags,
    aabb: aabbBox
  };
}

function debugGeometryScale(collider: GameCollider): GameVec3 {
  if (collider.kind === "box") return collider.size;
  if (collider.kind === "sphere") {
    const diameter = collider.radius * 2;
    return [diameter, diameter, collider.dimension === 2 ? 0 : diameter];
  }
  if (collider.kind === "capsule") return gameColliderAabb(collider).size;
  if (collider.plane === "xz") return [collider.size[0], 0, collider.size[1]];
  if (collider.plane === "yz") return [0, collider.size[0], collider.size[1]];
  return [collider.size[0], collider.size[1], 0];
}

function debugScenePrimitive(primitive: GameDebugGeometryPrimitive): GameDebugScenePrimitive {
  return primitive === "rect" ? "plane" : primitive;
}

function debugSceneScale(node: GameDebugGeometryNode): number | GameVec3 {
  if (node.primitive === "sphere") return node.radius ? node.radius * 2 : node.scale;
  return node.scale;
}

function defaultDebugColor(source: string): string {
  if (source.includes("hurt")) return "#47d16c";
  if (source.includes("guard")) return "#5cc8ff";
  if (source.includes("push")) return "#ffd166";
  if (source.includes("hit")) return "#ff5c8a";
  if (source.includes("sensor")) return "#b78cff";
  return "#7dd3fc";
}

function aabb(center: GameVec3, size: GameVec3): GameAabb {
  const half: GameVec3 = [size[0] / 2, size[1] / 2, size[2] / 2];
  return {
    center,
    size,
    min: [center[0] - half[0], center[1] - half[1], center[2] - half[2]],
    max: [center[0] + half[0], center[1] + half[1], center[2] + half[2]]
  };
}

function intersects(a: GameAabb, b: GameAabb): boolean {
  return (
    a.min[0] <= b.max[0] &&
    a.max[0] >= b.min[0] &&
    a.min[1] <= b.max[1] &&
    a.max[1] >= b.min[1] &&
    a.min[2] <= b.max[2] &&
    a.max[2] >= b.min[2]
  );
}

function vec3(value: GameVec3 | undefined, fallback: GameVec3): GameVec3 {
  return value ? [value[0], value[1], value[2]] : fallback;
}

function vec3Flexible(value: GameVec2 | GameVec3 | undefined, fallback: GameVec3): GameVec3 {
  if (!value) return fallback;
  return value.length === 2 ? [value[0], value[1], fallback[2]] : [value[0], value[1], value[2]];
}

function vec2(value: GameVec2 | undefined, fallback: GameVec2): GameVec2 {
  return value ? [value[0], value[1]] : fallback;
}

function size3(value: GameVec3 | GameVec2 | undefined, fallback: GameVec3): GameVec3 {
  if (!value) return fallback;
  return value.length === 2 ? [value[0], value[1], 0] : [value[0], value[1], value[2]];
}

function kinematicSizeFromCollider(collider: GameCollider | undefined): GameVec3 | undefined {
  if (!collider) return undefined;
  return gameColliderAabb(collider).size;
}

function addVec3(a: GameVec3, b: GameVec3): GameVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scaleVec3(value: GameVec3, scale: number): GameVec3 {
  return [value[0] * scale, value[1] * scale, value[2] * scale];
}

function normalizeVec3(value: GameVec3): GameVec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  return length <= 0.0001 ? [0, 0, 0] : [value[0] / length, value[1] / length, value[2] / length];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampVec3ToBounds(value: GameVec3, bounds: GameBounds3): GameVec3 {
  return [
    clamp(value[0], bounds.minX ?? Number.NEGATIVE_INFINITY, bounds.maxX ?? Number.POSITIVE_INFINITY),
    clamp(value[1], bounds.minY ?? Number.NEGATIVE_INFINITY, bounds.maxY ?? Number.POSITIVE_INFINITY),
    clamp(value[2], bounds.minZ ?? Number.NEGATIVE_INFINITY, bounds.maxZ ?? Number.POSITIVE_INFINITY)
  ];
}

function round(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function applyDeadzone(value: number, deadzone: number, mode: GameInputDeadzoneMode = "axial"): number {
  const nextDeadzone = clamp(deadzone, 0, 0.99);
  const magnitude = Math.abs(value);
  if (magnitude < nextDeadzone) return 0;
  if (mode === "scaled") return Math.sign(value) * clamp((magnitude - nextDeadzone) / (1 - nextDeadzone), 0, 1);
  return value;
}

function gamepadButtonNames(index: number, gamepadIndex: number): readonly string[] {
  const names = [
    "GamepadA",
    "GamepadB",
    "GamepadX",
    "GamepadY",
    "GamepadLB",
    "GamepadRB",
    "GamepadLT",
    "GamepadRT",
    "GamepadBack",
    "GamepadStart",
    "GamepadLStick",
    "GamepadRStick",
    "GamepadDPadUp",
    "GamepadDPadDown",
    "GamepadDPadLeft",
    "GamepadDPadRight"
  ];
  return [`GamepadButton${index}`, `Gamepad${gamepadIndex}:Button${index}`, names[index] ?? `GamepadButton${index}`];
}

function defaultEffectColor(kind: GameEffectKind): string {
  if (kind === "block-spark") return "#8ee7ff";
  if (kind === "impact-decal") return "#ff8b5c";
  if (kind === "ground-dust") return "#c7b38f";
  if (kind === "dash-trail") return "#62f6c8";
  if (kind === "slash-trail") return "#d7fbff";
  if (kind === "aura-burst") return "#5cff87";
  if (kind === "shockwave" || kind === "ring-shockwave") return "#ffd166";
  if (kind === "impact-flash" || kind === "super-flash") return "#ffffff";
  return "#ffb84d";
}

function defaultEffectDuration(kind: GameEffectKind): number {
  if (kind === "impact-decal") return 0.7;
  if (kind === "ground-dust") return 0.34;
  if (kind === "dash-trail") return 0.28;
  if (kind === "slash-trail") return 0.18;
  if (kind === "aura-burst") return 0.9;
  if (kind === "shockwave" || kind === "ring-shockwave") return 0.42;
  if (kind === "impact-flash") return 0.12;
  if (kind === "super-flash") return 0.2;
  return 0.22;
}

function defaultEffectRadius(kind: GameEffectKind): number {
  if (kind === "impact-decal") return 0.42;
  if (kind === "aura-burst") return 1.4;
  if (kind === "shockwave" || kind === "ring-shockwave") return 1.05;
  if (kind === "dash-trail") return 0.52;
  if (kind === "slash-trail") return 0.62;
  if (kind === "ground-dust") return 0.36;
  if (kind === "super-flash") return 1.2;
  return 0.28;
}

function effectToSceneNode(effect: MutableGameEffectInstance): any {
  const life = Math.max(0, 1 - effect.age / Math.max(0.001, effect.duration));
  const ring = effect.kind === "shockwave" || effect.kind === "ring-shockwave";
  const trail = effect.kind === "dash-trail" || effect.kind === "slash-trail";
  const scalarScale = Math.max(0.04, effect.radius * (ring ? 1.4 - life * 0.4 : life));
  const trailScale: GameVec3 = [
    Math.max(0.08, effect.radius * life * 1.6),
    Math.max(0.02, effect.radius * life * 0.18),
    Math.max(0.04, effect.radius * life * 0.32)
  ];
  if (effect.kind === "aura-burst") {
    return {
      kind: "effect",
      effect: "particles",
      name: effect.id,
      color: effect.color,
      intensity: effect.intensity * life,
      particleCount: Math.round(160 + effect.intensity * 220),
      emitter: "swirl",
      radius: effect.radius,
      height: 1.4,
      materialMode: "additive-glow"
    };
  }
  return {
    kind: "primitive",
    primitive: ring ? "torus" : trail ? "box" : "sphere",
    name: effect.id,
    position: effect.position,
    scale: trail ? trailScale : scalarScale,
    material: {
      color: effect.color,
      emissive: effect.color,
      emissiveIntensity: effect.intensity * life,
      opacity: life
    }
  };
}

export function createGameHudHealthBinding(options: GameHudActorBindingOptions): GameHudBinding {
  return createGameHudBinding({
    binding: "health",
    id: options.id ?? `hud:${options.actorId}:health`,
    label: options.label ?? `${options.actorId} health`,
    source: "combat",
    targetId: options.actorId,
    valuePath: options.valuePath ?? `combat.actors.${options.actorId}.health`,
    maxPath: options.maxPath ?? "rules.maxHealth",
    format: "percent",
    a11yLabel: options.a11yLabel ?? `${options.actorId} health value`,
    visibleWhen: options.visibleWhen
  });
}

export function createGameHudMeterBinding(options: GameHudActorBindingOptions): GameHudBinding {
  return createGameHudBinding({
    binding: "meter",
    id: options.id ?? `hud:${options.actorId}:meter`,
    label: options.label ?? `${options.actorId} meter`,
    source: "combat",
    targetId: options.actorId,
    valuePath: options.valuePath ?? `combat.actors.${options.actorId}.meter`,
    maxPath: options.maxPath ?? "rules.maxMeter",
    format: "percent",
    a11yLabel: options.a11yLabel ?? `${options.actorId} super meter value`,
    visibleWhen: options.visibleWhen
  });
}

export function createGameHudTimerBinding(options: GameHudTimerBindingOptions = {}): GameHudBinding {
  return createGameHudBinding({
    binding: "timer",
    id: options.id ?? "hud:round:timer",
    label: options.label ?? "round timer",
    source: "round",
    valuePath: options.valuePath ?? "round.timeRemaining",
    format: "clock",
    a11yLabel: options.a11yLabel ?? "round timer",
    visibleWhen: options.visibleWhen
  });
}

export function createGameHudComboBinding(options: GameHudComboBindingOptions = {}): GameHudBinding {
  const targetId = options.actorId;
  return createGameHudBinding({
    binding: "combo",
    id: options.id ?? (targetId ? `hud:${targetId}:combo` : "hud:combo"),
    label: options.label ?? (targetId ? `${targetId} combo` : "combo counter"),
    source: "combat",
    targetId,
    valuePath: options.valuePath ?? (targetId ? `combat.actors.${targetId}.combo` : "combat.combo"),
    format: "number",
    a11yLabel: options.a11yLabel ?? (targetId ? `${targetId} combo counter` : "combo counter"),
    visibleWhen: options.visibleWhen
  });
}

export function createGameHudRoundBinding(options: GameHudRoundBindingOptions = {}): GameHudBinding {
  return createGameHudBinding({
    binding: "round",
    id: options.id ?? "hud:round:index",
    label: options.label ?? "round",
    source: "round",
    valuePath: options.valuePath ?? "round.index",
    format: "number",
    a11yLabel: options.a11yLabel ?? "current round",
    visibleWhen: options.visibleWhen
  });
}

export function createGameHudDebugToggleBinding(options: GameHudDebugToggleBindingOptions = {}): GameHudBinding {
  return createGameHudBinding({
    binding: "debug-toggle",
    id: options.id ?? "hud:debug:toggle",
    label: options.label ?? "debug overlay",
    source: "debug",
    valuePath: options.statePath ?? "debug.visible",
    format: "boolean",
    a11yLabel: options.a11yLabel ?? "debug overlay toggle",
    debugOnly: true,
    interactive: true,
    visibleWhen: options.visibleWhen ?? options.action
  });
}

export function createGameHudBindings(bindings: readonly GameHudBinding[]): readonly GameHudBinding[] {
  return [...bindings];
}

export function createGameHudSnapshot(options: GameHudSnapshotOptions): GameHudSnapshot {
  const combatSnapshot =
    options.combat && "kind" in options.combat && options.combat.kind === "aura-game-combat-world"
      ? options.combat
      : options.combat && "snapshot" in options.combat
        ? options.combat.snapshot()
        : undefined;
  const inputSnapshot =
    options.input && "kind" in options.input && options.input.kind === "aura-game-input-snapshot"
      ? options.input
      : options.input && "snapshot" in options.input
        ? options.input.snapshot()
        : undefined;
  const events = options.events ?? combatSnapshot?.events ?? [];
  const data = createGameHudDataContext({
    combat: combatSnapshot,
    round: options.round,
    rules: options.rules,
    input: inputSnapshot,
    runtime: options.runtime,
    debug: options.debug,
    appState: options.appState
  });
  const values = options.bindings.map((binding) => {
    const value = readGameValuePath(data, binding.valuePath);
    const max = binding.maxPath ? readGameValuePath(data, binding.maxPath) : undefined;
    const changed = gameHudBindingChanged(binding, events);
    return {
      kind: "aura-game-hud-value" as const,
      id: binding.id,
      binding: binding.binding,
      label: binding.label,
      source: binding.source,
      targetId: binding.targetId,
      valuePath: binding.valuePath,
      value,
      max,
      formatted: formatGameHudValue(value, max, binding.format),
      changed,
      debugOnly: binding.debugOnly,
      interactive: binding.interactive,
      a11yLabel: binding.a11yLabel
    };
  });
  return {
    kind: "aura-game-hud-snapshot",
    frame: combatSnapshot?.frame ?? inputSnapshot?.frame ?? 0,
    time: combatSnapshot?.time ?? inputSnapshot?.time ?? 0,
    values,
    changedIds: values.filter((value) => value.changed).map((value) => value.id),
    events
  };
}

export function createGameAccessibilityLabel(options: GameAccessibilityLabelOptions): GameAccessibilitySource {
  return {
    kind: "aura-game-accessibility-source",
    feature: "label",
    id: options.id ?? `a11y:${options.targetId}:label`,
    owner: "app",
    label: options.label,
    targetId: options.targetId,
    role: options.role ?? "status",
    actions: [],
    source: "dom",
    evidence: options.live
      ? "App owns an aria-live label for this gameplay target."
      : "App owns a readable label for this gameplay target."
  };
}

export function createGameAccessibilityFocus(options: GameAccessibilityFocusOptions): GameAccessibilitySource {
  return {
    kind: "aura-game-accessibility-source",
    feature: "focus",
    id: options.id ?? `a11y:${options.scopeId}:focus`,
    owner: "app",
    label: options.label ?? `${options.scopeId} focus scope`,
    targetId: options.scopeId,
    actions: options.targets ?? [],
    source: "dom",
    evidence: "App owns keyboard focus order and focus restoration for this gameplay UI scope."
  };
}

export function createGameReducedMotionSource(options: GameAccessibilityPreferenceOptions = {}): GameAccessibilitySource {
  return {
    kind: "aura-game-accessibility-source",
    feature: "reduced-motion",
    id: options.id ?? "a11y:prefers-reduced-motion",
    owner: "shared",
    label: options.label ?? "prefers reduced motion",
    actions: [],
    enabled: options.enabled,
    source: "media-query",
    evidence: "App reads the user preference; Aura3D camera and effects helpers consume reducedMotion flags."
  };
}

export function createGameReducedFlashSource(options: GameAccessibilityPreferenceOptions = {}): GameAccessibilitySource {
  return {
    kind: "aura-game-accessibility-source",
    feature: "reduced-flash",
    id: options.id ?? "a11y:reduced-flash",
    owner: "shared",
    label: options.label ?? "reduced flash",
    actions: [],
    enabled: options.enabled,
    source: "app-state",
    evidence: "App stores the flash preference; Aura3D effects helpers consume reducedFlash flags."
  };
}

export function createGameHighContrastSource(options: GameAccessibilityPreferenceOptions = {}): GameAccessibilitySource {
  return {
    kind: "aura-game-accessibility-source",
    feature: "high-contrast",
    id: options.id ?? "a11y:high-contrast",
    owner: "app",
    label: options.label ?? "high contrast HUD",
    actions: [],
    enabled: options.enabled,
    source: "app-state",
    evidence: "App owns high-contrast CSS/theme state for HUD, menus, labels, and focus rings."
  };
}

export function createGamePauseControlsSource(options: GameAccessibilityPauseControlsOptions = {}): GameAccessibilitySource {
  const actions = options.actions ?? ["pause", "Escape", "GamepadStart"];
  return {
    kind: "aura-game-accessibility-source",
    feature: "pause-controls",
    id: options.id ?? "a11y:pause-controls",
    owner: "shared",
    label: options.label ?? "pause and resume controls",
    targetId: options.menuId,
    actions: [...actions, ...(options.resumeActions ?? [])],
    source: "input",
    evidence: "App maps pause/resume input and calls Aura3D app.pause(), app.resume(), or app.step() without remounting the scene."
  };
}

export function createGameAccessibilityRuntimeSettings(
  sources: readonly GameAccessibilitySource[] = [],
  options: GameAccessibilityRuntimeSettingsOptions = {}
): GameAccessibilityRuntimeSettings {
  const sourceEnabled = (feature: GameAccessibilitySourceKind): boolean =>
    sources.some((source) => source.feature === feature && source.enabled === true);
  const reducedMotion = options.reducedMotion ?? sourceEnabled("reduced-motion");
  const reducedFlash = options.reducedFlash ?? sourceEnabled("reduced-flash");
  const highContrast = options.highContrast ?? sourceEnabled("high-contrast");
  return {
    kind: "aura-game-accessibility-runtime-settings",
    reducedMotion,
    reducedFlash,
    highContrast,
    camera: { reducedMotion },
    effects: { reducedMotion, reducedFlash },
    evidence: [
      reducedMotion
        ? "Reduced-motion preference is forwarded to game.cameraDirector({ reducedMotion: true }) and game.effects({ reducedMotion: true })."
        : "Camera and effects keep normal motion because reduced-motion is not enabled.",
      reducedFlash
        ? "Reduced-flash preference is forwarded to game.effects({ reducedFlash: true }) to cap flash intensity."
        : "Effects keep normal flash intensity because reduced-flash is not enabled.",
      highContrast
        ? "High-contrast preference is available for HUD/menu rendering without querying WebGL state."
        : "HUD/menu rendering can use the default contrast theme."
    ]
  };
}

function createGameHudDataContext(options: {
  readonly combat?: GameCombatWorldSnapshot;
  readonly round?: Record<string, unknown>;
  readonly rules?: Record<string, unknown>;
  readonly input?: GameInputSnapshot;
  readonly runtime?: Record<string, unknown>;
  readonly debug?: Record<string, unknown>;
  readonly appState?: Record<string, unknown>;
}): Record<string, unknown> {
  const actors: Record<string, unknown> = {};
  for (const actor of options.combat?.actors ?? []) actors[actor.id] = actor;
  return {
    combat: {
      ...(options.combat ?? {}),
      actors,
      events: options.combat?.events ?? []
    },
    round: options.round ?? {},
    rules: {
      maxHealth: 100,
      maxGuard: 100,
      maxMeter: 100,
      ...(options.rules ?? {})
    },
    input: options.input ?? {},
    runtime: options.runtime ?? {},
    debug: options.debug ?? {},
    appState: options.appState ?? {}
  };
}

function readGameValuePath(source: unknown, path: string): GameHudResolvedValue {
  const value = path.split(".").reduce<unknown>((current, key) => {
    if (current === undefined || current === null) return undefined;
    if (typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean" || value === undefined) return value;
  return JSON.stringify(value);
}

function formatGameHudValue(value: GameHudResolvedValue, max: GameHudResolvedValue, format: GameHudValueFormat): string {
  if (value === undefined) return "";
  if (format === "boolean") return value ? "on" : "off";
  if (format === "clock") return formatClockValue(value);
  if (format === "percent") {
    const numericValue = Number(value);
    const numericMax = Number(max ?? 100);
    if (!Number.isFinite(numericValue) || !Number.isFinite(numericMax) || numericMax <= 0) return String(value);
    return `${Math.round(clamp(numericValue / numericMax, 0, 1) * 100)}%`;
  }
  if (format === "number" && typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

function formatClockValue(value: GameHudResolvedValue): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return String(value);
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const remaining = Math.floor(Math.max(0, seconds) % 60);
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function gameHudBindingChanged(binding: GameHudBinding, events: readonly GameCombatEvent[]): boolean {
  if (!events.length) return false;
  if (binding.binding === "health" || binding.binding === "combo") {
    return events.some((event) => event.targetId === binding.targetId && (event.damage ?? 0) > 0);
  }
  if (binding.binding === "meter") {
    return events.some((event) => event.attackerId === binding.targetId && (event.damage ?? event.guardDamage ?? 0) > 0);
  }
  if (binding.binding === "debug-toggle") return events.some((event) => event.type === "hit" || event.type === "blocked");
  return events.length > 0;
}

function createGameHudBinding(options: Omit<GameHudBinding, "kind" | "owner" | "debugOnly" | "interactive"> & {
  readonly debugOnly?: boolean;
  readonly interactive?: boolean;
}): GameHudBinding {
  return {
    kind: "aura-game-hud-binding",
    owner: "app",
    debugOnly: options.debugOnly ?? false,
    interactive: options.interactive ?? false,
    ...options
  };
}
