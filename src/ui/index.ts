/**
 * @fileoverview G3D UI System - Comprehensive UI framework for the G3D engine.
 * Provides screen-space and world-space UI rendering with layout, interaction, and styling.
 * @module ui
 */

// Core UI elements
export {
  UIElement,
  UIAnchor,
  UIEventType,
} from './UIElement';
export type {
  UIEvent,
  UIEventListener
} from './UIElement';

export {
  UICanvas,
  UICanvasMode,
  UIScaleMode
} from './UICanvas';

// UI components
export {
  UIText,
  UITextAlign,
  UITextVerticalAlign,
  UITextOverflow
} from './UIText';

export {
  UIImage,
  UIImageType,
  UIFillMethod,
  UIFillOrigin
} from './UIImage';

export {
  UIButton,
  UIButtonState,
  UIButtonTransition,
} from './UIButton';
export type {
  UIButtonColors
} from './UIButton';

export {
  UISlider,
  UISliderDirection
} from './UISlider';

export {
  UIScrollView,
  UIScrollDirection
} from './UIScrollView';

export {
  UILayout,
  UILayoutType,
  UILayoutAlign
} from './UILayout';

export {
  UIInputField,
  UIInputContentType,
  UIInputLineType
} from './UIInputField';

// Rendering
export { UIRenderer } from './UIRenderer';

// ECS integration
export {
  UISystem,
  UIComponent,
  createUICanvas
} from './UISystem';

// Styling and theming
export * from './styling';

// Animation and interaction
export {
  UIAnimator,
  AnimationType,
  SlideDirection
} from './UIAnimator';
export type {
  UIAnimationConfig,
} from './UIAnimator';

export {
  UIDragDrop,
} from './UIDragDrop';
export type {
  DragDropEvent,
  DragStartCallback,
  DragMoveCallback,
  DragEndCallback,
  DropCallback
} from './UIDragDrop';

export {
  UIClipboard,
  ClipboardDataType,
} from './UIClipboard';
export type {
  ClipboardData,
  ClipboardResult
} from './UIClipboard';

export {
  UIAccessibility,
  AriaRole,
} from './UIAccessibility';
export type {
  AccessibilityProps
} from './UIAccessibility';

/**
 * UI System Overview:
 *
 * The G3D UI system provides a comprehensive framework for creating interactive
 * user interfaces in both screen-space and world-space.
 *
 * ## Core Concepts
 *
 * - **UICanvas**: Root container that manages the UI hierarchy and event routing
 * - **UIElement**: Base class for all UI components with transform and events
 * - **UILayout**: Automatic positioning and sizing of child elements
 * - **UIRenderer**: Efficient batch rendering with sprite batching
 *
 * ## Component Hierarchy
 *
 * ```
 * UICanvas (root)
 *   ├─ UIButton (interactive)
 *   │   ├─ UIImage (background)
 *   │   └─ UIText (label)
 *   ├─ UIScrollView (container)
 *   │   └─ UILayout (automatic layout)
 *   │       ├─ UIText
 *   │       ├─ UIImage
 *   │       └─ ...
 *   └─ UIInputField (text input)
 * ```
 *
 * ## Example Usage
 *
 * ```typescript
 * import { UICanvas, UIButton, UIText, UILayout, UILayoutType } from '@g3d/ui';
 *
 * // Create canvas
 * const canvas = new UICanvas(document.getElementById('game-canvas') as HTMLCanvasElement);
 * canvas.scaleMode = UIScaleMode.ScaleWithScreenSize;
 * canvas.referenceResolution.set(1920, 1080);
 *
 * // Create a menu
 * const menu = new UILayout();
 * menu.layoutType = UILayoutType.Vertical;
 * menu.spacing = 20;
 * menu.position.set(100, 100);
 * menu.size.set(300, 400);
 * canvas.addChild(menu);
 *
 * // Add buttons
 * const playButton = UIButton.createPrimary('Play Game');
 * playButton.onClick(() => startGame());
 * menu.addChild(playButton);
 *
 * const settingsButton = UIButton.createPrimary('Settings');
 * settingsButton.onClick(() => openSettings());
 * menu.addChild(settingsButton);
 *
 * const quitButton = UIButton.createDanger('Quit');
 * quitButton.onClick(() => quitGame());
 * menu.addChild(quitButton);
 *
 * // Rebuild layout
 * menu.rebuildLayout();
 *
 * // Game loop
 * function gameLoop(deltaTime: number) {
 *   canvas.update(deltaTime);
 *   canvas.render();
 * }
 * ```
 *
 * ## Features
 *
 * - **Screen-space and world-space rendering**
 * - **Flexible anchoring and pivots**
 * - **Automatic layouts (horizontal, vertical, grid)**
 * - **Event handling (click, hover, drag, focus)**
 * - **Rich text rendering**
 * - **Image rendering (simple, sliced, tiled, filled)**
 * - **Interactive controls (buttons, sliders, input fields)**
 * - **Scrollable containers with momentum**
 * - **Batch rendering for performance**
 * - **ECS integration**
 *
 * ## Performance Tips
 *
 * 1. Use batch rendering by grouping similar elements
 * 2. Disable updates for static UI (`element.enabled = false`)
 * 3. Use clipChildren to limit rendering scope
 * 4. Pool frequently created/destroyed elements
 * 5. Use UILayout for complex hierarchies instead of manual positioning
 *
 * ## Best Practices
 *
 * 1. Set up canvas scaling for responsive design
 * 2. Use anchors and pivots for resolution-independent positioning
 * 3. Leverage UILayout for maintainable UI structures
 * 4. Create reusable UI components by extending base classes
 * 5. Use event bubbling for hierarchical event handling
 * 6. Test UI at different resolutions and aspect ratios
 */
