import { UIElement } from './UIElement';
import { Logger } from '../core/Logger';

const logger = Logger.create('UIDragDrop');

/**
 * Drag and drop event data.
 */
export interface DragDropEvent {
  /**
   * Source element being dragged.
   */
  source: UIElement;

  /**
   * Target element being dragged over (or dropped on).
   */
  target: UIElement | null;

  /**
   * Mouse X position.
   */
  mouseX: number;

  /**
   * Mouse Y position.
   */
  mouseY: number;

  /**
   * Drag offset X from element origin.
   */
  offsetX: number;

  /**
   * Drag offset Y from element origin.
   */
  offsetY: number;

  /**
   * Custom data attached to the drag operation.
   */
  data?: unknown;
}

/**
 * Callback types for drag and drop events.
 */
export type DragStartCallback = (event: DragDropEvent) => boolean | void;
export type DragMoveCallback = (event: DragDropEvent) => void;
export type DragEndCallback = (event: DragDropEvent) => void;
export type DropCallback = (event: DragDropEvent) => boolean | void;

/**
 * Drag and drop operation state.
 */
interface DragState {
  source: UIElement;
  initialX: number;
  initialY: number;
  offsetX: number;
  offsetY: number;
  data?: unknown;
  visualFeedback?: UIElement;
}

/**
 * Element drag and drop configuration.
 */
interface ElementDragConfig {
  draggable: boolean;
  droppable: boolean;
  onDragStart?: DragStartCallback;
  onDragMove?: DragMoveCallback;
  onDragEnd?: DragEndCallback;
  onDrop?: DropCallback;
}

/**
 * Drag and drop system for UI elements.
 * Supports dragging elements between containers with visual feedback.
 */
export class UIDragDrop {
  private static dragConfigs: Map<UIElement, ElementDragConfig> = new Map();
  private static currentDrag: DragState | null = null;
  private static lastTarget: UIElement | null = null;

  /**
   * Makes an element draggable.
   *
   * @param element - Element to make draggable
   * @param onDragStart - Callback when drag starts
   * @param onDragMove - Callback during drag
   * @param onDragEnd - Callback when drag ends
   */
  static makeDraggable(
    element: UIElement,
    onDragStart?: DragStartCallback,
    onDragMove?: DragMoveCallback,
    onDragEnd?: DragEndCallback
  ): void {
    const config = this.dragConfigs.get(element) || {
      draggable: false,
      droppable: false,
    };

    config.draggable = true;
    config.onDragStart = onDragStart;
    config.onDragMove = onDragMove;
    config.onDragEnd = onDragEnd;

    this.dragConfigs.set(element, config);
    logger.debug('Element configured as draggable');
  }

  /**
   * Makes an element a drop target.
   *
   * @param element - Element to make droppable
   * @param onDrop - Callback when item is dropped on this element
   */
  static makeDroppable(element: UIElement, onDrop?: DropCallback): void {
    const config = this.dragConfigs.get(element) || {
      draggable: false,
      droppable: false,
    };

    config.droppable = true;
    config.onDrop = onDrop;

    this.dragConfigs.set(element, config);
    logger.debug('Element configured as droppable');
  }

  /**
   * Removes drag and drop configuration from an element.
   *
   * @param element - Element to remove configuration from
   */
  static remove(element: UIElement): void {
    if (this.currentDrag?.source === element) {
      this.endDrag(element.position.x, element.position.y);
    }
    this.dragConfigs.delete(element);
    logger.debug('Drag/drop configuration removed from element');
  }

  /**
   * Starts a drag operation on an element.
   *
   * @param element - Element to start dragging
   * @param mouseX - Mouse X position
   * @param mouseY - Mouse Y position
   * @param data - Optional data to attach to the drag operation
   * @returns True if drag started, false if prevented
   */
  static startDrag(element: UIElement, mouseX: number, mouseY: number, data?: unknown): boolean {
    const config = this.dragConfigs.get(element);
    if (!config || !config.draggable) {
      return false;
    }

    if (this.currentDrag) {
      this.endDrag(mouseX, mouseY);
    }

    const offsetX = mouseX - element.position.x;
    const offsetY = mouseY - element.position.y;

    const event: DragDropEvent = {
      source: element,
      target: null,
      mouseX,
      mouseY,
      offsetX,
      offsetY,
      data,
    };

    if (config.onDragStart) {
      const result = config.onDragStart(event);
      if (result === false) {
        logger.debug('Drag start prevented by callback');
        return false;
      }
    }

    this.currentDrag = {
      source: element,
      initialX: element.position.x,
      initialY: element.position.y,
      offsetX,
      offsetY,
      data,
    };

    logger.info('Drag operation started');
    return true;
  }

  /**
   * Updates the drag operation with new mouse position.
   *
   * @param mouseX - Mouse X position
   * @param mouseY - Mouse Y position
   * @param elements - All UI elements to check for drop targets
   */
  static updateDrag(mouseX: number, mouseY: number, elements: UIElement[]): void {
    if (!this.currentDrag) {
      return;
    }

    const { source, offsetX, offsetY, data } = this.currentDrag;

    source.position.x = mouseX - offsetX;
    source.position.y = mouseY - offsetY;

    const target = this.findDropTarget(mouseX, mouseY, elements);

    const event: DragDropEvent = {
      source,
      target,
      mouseX,
      mouseY,
      offsetX,
      offsetY,
      data,
    };

    const config = this.dragConfigs.get(source);
    if (config?.onDragMove) {
      config.onDragMove(event);
    }

    if (target !== this.lastTarget) {
      this.lastTarget = target;
    }
  }

  /**
   * Ends the current drag operation.
   *
   * @param mouseX - Mouse X position
   * @param mouseY - Mouse Y position
   * @param elements - All UI elements to check for drop targets
   */
  static endDrag(mouseX: number, mouseY: number, elements?: UIElement[]): void {
    if (!this.currentDrag) {
      return;
    }

    const { source, offsetX, offsetY, data } = this.currentDrag;

    let target: UIElement | null = null;
    if (elements) {
      target = this.findDropTarget(mouseX, mouseY, elements);
    }

    const event: DragDropEvent = {
      source,
      target,
      mouseX,
      mouseY,
      offsetX,
      offsetY,
      data,
    };

    const sourceConfig = this.dragConfigs.get(source);
    if (sourceConfig?.onDragEnd) {
      sourceConfig.onDragEnd(event);
    }

    if (target) {
      const targetConfig = this.dragConfigs.get(target);
      if (targetConfig?.onDrop) {
        const result = targetConfig.onDrop(event);
        if (result === false) {
          source.position.x = this.currentDrag.initialX;
          source.position.y = this.currentDrag.initialY;
          logger.debug('Drop rejected, element returned to original position');
        } else {
          logger.info('Drop accepted');
        }
      }
    }

    this.currentDrag = null;
    this.lastTarget = null;
    logger.info('Drag operation ended');
  }

  /**
   * Finds the drop target element at the given position.
   *
   * @param mouseX - Mouse X position
   * @param mouseY - Mouse Y position
   * @param elements - All UI elements to check
   * @returns Drop target element or null if none found
   */
  private static findDropTarget(mouseX: number, mouseY: number, elements: UIElement[]): UIElement | null {
    if (!this.currentDrag) {
      return null;
    }

    for (let i = elements.length - 1; i >= 0; i--) {
      const element = elements[i];

      if (element === this.currentDrag.source) {
        continue;
      }

      const config = this.dragConfigs.get(element);
      if (!config || !config.droppable) {
        continue;
      }

      if (!element.visible || !element.enabled) {
        continue;
      }

      if (this.hitTest(element, mouseX, mouseY)) {
        return element;
      }
    }

    return null;
  }

  /**
   * Tests if a point is inside an element's bounds.
   *
   * @param element - Element to test
   * @param x - X position
   * @param y - Y position
   * @returns True if point is inside element
   */
  private static hitTest(element: UIElement, x: number, y: number): boolean {
    return (
      x >= element.position.x &&
      x <= element.position.x + element.size.x &&
      y >= element.position.y &&
      y <= element.position.y + element.size.y
    );
  }

  /**
   * Checks if an element is currently being dragged.
   *
   * @param element - Element to check
   * @returns True if element is being dragged
   */
  static isDragging(element: UIElement): boolean {
    return this.currentDrag?.source === element;
  }

  /**
   * Gets the element currently being dragged.
   *
   * @returns Currently dragged element or null
   */
  static getCurrentDrag(): UIElement | null {
    return this.currentDrag?.source || null;
  }

  /**
   * Checks if any drag operation is in progress.
   *
   * @returns True if dragging
   */
  static isAnyDragging(): boolean {
    return this.currentDrag !== null;
  }

  /**
   * Cancels the current drag operation without triggering drop.
   */
  static cancelDrag(): void {
    if (!this.currentDrag) {
      return;
    }

    const { source, initialX, initialY } = this.currentDrag;
    source.position.x = initialX;
    source.position.y = initialY;

    this.currentDrag = null;
    this.lastTarget = null;
    logger.info('Drag operation cancelled');
  }

  /**
   * Clears all drag and drop configurations.
   */
  static clear(): void {
    this.dragConfigs.clear();
    this.currentDrag = null;
    this.lastTarget = null;
    logger.debug('Cleared all drag/drop configurations');
  }
}
