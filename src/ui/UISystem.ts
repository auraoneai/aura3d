/**
 * @fileoverview ECS integration system for UI management.
 * @module ui/UISystem
 */

import { System, SystemContext, QueryDescriptor } from '../ecs/System';
import { IComponent } from '../ecs/ComponentRegistry';
import { UICanvas } from './UICanvas';
import { Logger } from '../core/Logger';

const logger = new Logger('UISystem');

/**
 * UI component for entities
 */
export class UIComponent {
  /**
   * UI canvas attached to this entity
   */
  public canvas: UICanvas | null = null;

  /**
   * Whether UI should be updated
   */
  public active: boolean = true;

  /**
   * Whether UI should be rendered
   */
  public visible: boolean = true;
}

/**
 * ECS system for managing UI canvases.
 * Handles update and render loops for all UI canvases in the world.
 *
 * @example
 * ```typescript
 * // In your game setup
 * const world = new World();
 * const uiSystem = new UISystem();
 * world.addSystem(uiSystem);
 *
 * // Create UI entity
 * const uiEntity = world.createEntity();
 * const uiComponent = new UIComponent();
 * uiComponent.canvas = new UICanvas(canvas);
 * world.addComponent(uiEntity, uiComponent);
 * ```
 */
export class UISystem extends System {
  /**
   * All UI canvases being managed
   */
  protected canvases: UICanvas[] = [];

  /**
   * Query for UI components
   */
  readonly query: QueryDescriptor = [UIComponent as any];

  /**
   * Creates a new UI system.
   *
   * @example
   * ```typescript
   * const uiSystem = new UISystem();
   * ```
   */
  constructor() {
    super({
      name: 'UISystem',
      priority: 500 // Render after game logic
    });

    logger.debug('UISystem created');
  }

  /**
   * Initializes the UI system.
   */
  override onInit(): void {
    logger.info('UISystem initialized');
  }

  /**
   * Updates all UI canvases.
   */
  override update(context: SystemContext): void {
    const query = this.getQuery();

    // Clear canvas list
    this.canvases = [];

    // Collect all active canvases
    query.forEach((entity, components) => {
      const uiComponent = components[0] as UIComponent;

      if (uiComponent.active && uiComponent.canvas) {
        this.canvases.push(uiComponent.canvas);
      }
    });

    // Update all canvases
    for (const canvas of this.canvases) {
      if (canvas.visible && canvas.enabled) {
        canvas.update(context.deltaTime);
      }
    }
  }

  /**
   * Renders all UI canvases.
   * Called in late update to render after all game logic.
   */
  override lateUpdate(context: SystemContext): void {
    // Sort canvases by sort order
    const sortedCanvases = [...this.canvases].sort((a, b) => a.sortOrder - b.sortOrder);

    // Render all canvases
    for (const canvas of sortedCanvases) {
      if (canvas.visible && canvas.enabled) {
        try {
          canvas.render();
        } catch (error) {
          logger.error('Error rendering canvas:', error);
        }
      }
    }
  }

  /**
   * Cleans up the UI system.
   */
  override onDestroy(): void {
    // Destroy all canvases
    for (const canvas of this.canvases) {
      canvas.destroy();
    }

    this.canvases = [];
    logger.info('UISystem destroyed');
  }

  /**
   * Gets all managed canvases.
   *
   * @returns Array of UI canvases
   */
  getCanvases(): readonly UICanvas[] {
    return this.canvases;
  }

  /**
   * Finds a canvas by name.
   *
   * @param name - Canvas name
   * @returns Canvas or undefined
   */
  findCanvas(name: string): UICanvas | undefined {
    return this.canvases.find(c => c.name === name);
  }
}

/**
 * Helper function to create a UI canvas entity.
 *
 * @param htmlCanvas - HTML canvas element
 * @returns UI component with canvas
 *
 * @example
 * ```typescript
 * const world = new World();
 * const entity = world.createEntity();
 * const uiComponent = createUICanvas(document.getElementById('game-canvas') as HTMLCanvasElement);
 * world.addComponent(entity, uiComponent);
 * ```
 */
export function createUICanvas(htmlCanvas: HTMLCanvasElement): UIComponent {
  const component = new UIComponent();
  component.canvas = new UICanvas(htmlCanvas);
  return component;
}
