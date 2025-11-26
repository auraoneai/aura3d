/**
 * HotspotManager - Interactive 3D hotspot system for product annotations
 *
 * @example
 * ```typescript
 * const hotspots = new HotspotManager(camera, canvas);
 *
 * // Add hotspot
 * const hotspot = hotspots.add({
 *   id: 'material',
 *   position: new Vector3(0, 0.5, 0),
 *   label: 'Premium Leather',
 *   content: 'Handcrafted from Italian leather',
 *   onClick: (hotspot) => console.log('Clicked:', hotspot.label)
 * });
 *
 * // Update hotspots in render loop
 * hotspots.update(viewMatrix, projectionMatrix);
 *
 * // Remove hotspot
 * hotspots.remove('material');
 * ```
 */

import { Vector3 } from '../../math/Vector3';
import { Vector4 } from '../../math/Vector4';
import { Matrix4 } from '../../math/Matrix4';

export interface HotspotConfig {
  /** Unique identifier */
  id: string;
  /** 3D position in world space */
  position: Vector3;
  /** Label text */
  label: string;
  /** Detailed content/description */
  content?: string;
  /** Icon URL or emoji */
  icon?: string;
  /** Group name for organizing hotspots */
  group?: string;
  /** Visibility based on camera angle (dot product threshold) */
  visibilityThreshold?: number;
  /** Custom CSS class */
  className?: string;
  /** Click handler */
  onClick?: (hotspot: Hotspot) => void;
  /** Hover enter handler */
  onHoverEnter?: (hotspot: Hotspot) => void;
  /** Hover exit handler */
  onHoverExit?: (hotspot: Hotspot) => void;
  /** Custom data */
  data?: any;
}

export interface HotspotScreenPosition {
  x: number;
  y: number;
  visible: boolean;
  occluded: boolean;
}

/**
 * Hotspot instance
 */
export class Hotspot {
  public id: string;
  public position: Vector3;
  public label: string;
  public content: string;
  public icon: string | null;
  public group: string | null;
  public visibilityThreshold: number;
  public className: string;
  public onClick: ((hotspot: Hotspot) => void) | null;
  public onHoverEnter: ((hotspot: Hotspot) => void) | null;
  public onHoverExit: ((hotspot: Hotspot) => void) | null;
  public data: any;

  // Screen position
  public screenX: number;
  public screenY: number;
  public visible: boolean;
  public occluded: boolean;

  // Hover state
  public isHovered: boolean;

  // DOM element
  public element: HTMLElement | null;

  constructor(config: HotspotConfig) {
    this.id = config.id;
    this.position = config.position.clone();
    this.label = config.label;
    this.content = config.content || '';
    this.icon = config.icon || null;
    this.group = config.group || null;
    this.visibilityThreshold = config.visibilityThreshold ?? 0.0;
    this.className = config.className || '';
    this.onClick = config.onClick || null;
    this.onHoverEnter = config.onHoverEnter || null;
    this.onHoverExit = config.onHoverExit || null;
    this.data = config.data;

    this.screenX = 0;
    this.screenY = 0;
    this.visible = true;
    this.occluded = false;
    this.isHovered = false;
    this.element = null;
  }

  /**
   * Update screen position
   */
  public updateScreenPosition(
    viewMatrix: Matrix4,
    projectionMatrix: Matrix4,
    viewportWidth: number,
    viewportHeight: number,
    cameraPosition: Vector3
  ): void {
    // Transform to clip space
    const mvp = projectionMatrix.clone().multiply(viewMatrix);
    const pos4 = new Vector4(this.position.x, this.position.y, this.position.z, 1.0);
    const clipPos = mvp.multiplyVector4(pos4);

    // Check if behind camera
    if (clipPos.w <= 0) {
      this.visible = false;
      return;
    }

    // Perspective divide
    const ndc = new Vector3(
      clipPos.x / clipPos.w,
      clipPos.y / clipPos.w,
      clipPos.z / clipPos.w
    );

    // Check if in view frustum
    if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || ndc.z < -1 || ndc.z > 1) {
      this.visible = false;
      return;
    }

    // Convert to screen space
    this.screenX = (ndc.x * 0.5 + 0.5) * viewportWidth;
    this.screenY = (1 - (ndc.y * 0.5 + 0.5)) * viewportHeight;

    // Check visibility based on camera angle
    if (this.visibilityThreshold > 0) {
      const toCamera = cameraPosition.clone().subtract(this.position).normalize();
      const normal = new Vector3(0, 0, 1); // Assume hotspot faces camera
      const dot = toCamera.dot(normal);

      this.visible = dot >= this.visibilityThreshold;
    } else {
      this.visible = true;
    }
  }

  /**
   * Clone hotspot
   */
  public clone(): Hotspot {
    return new Hotspot({
      id: this.id,
      position: this.position,
      label: this.label,
      content: this.content,
      icon: this.icon || undefined,
      group: this.group || undefined,
      visibilityThreshold: this.visibilityThreshold,
      className: this.className,
      onClick: this.onClick || undefined,
      onHoverEnter: this.onHoverEnter || undefined,
      onHoverExit: this.onHoverExit || undefined,
      data: this.data
    });
  }
}

/**
 * HotspotManager manages interactive 3D hotspots
 */
export class HotspotManager {
  private _hotspots: Map<string, Hotspot>;
  private _container: HTMLElement | null;
  private _canvas: HTMLCanvasElement | null;
  private _viewportWidth: number;
  private _viewportHeight: number;
  private _enabled: boolean;
  private _showTooltips: boolean;
  private _animateOnHover: boolean;

  // Tooltip
  private _tooltipElement: HTMLElement | null;
  private _currentTooltipHotspot: Hotspot | null;

  constructor(canvas?: HTMLCanvasElement) {
    this._hotspots = new Map();
    this._container = null;
    this._canvas = canvas || null;
    this._viewportWidth = 1;
    this._viewportHeight = 1;
    this._enabled = true;
    this._showTooltips = true;
    this._animateOnHover = true;

    this._tooltipElement = null;
    this._currentTooltipHotspot = null;

    if (canvas) {
      this._initializeContainer(canvas);
    }
  }

  /**
   * Initialize hotspot container
   */
  private _initializeContainer(canvas: HTMLCanvasElement): void {
    this._canvas = canvas;

    // Create container
    this._container = document.createElement('div');
    this._container.style.position = 'absolute';
    this._container.style.top = '0';
    this._container.style.left = '0';
    this._container.style.width = '100%';
    this._container.style.height = '100%';
    this._container.style.pointerEvents = 'none';
    this._container.style.zIndex = '1000';

    // Insert after canvas
    if (canvas.parentElement) {
      canvas.parentElement.style.position = 'relative';
      canvas.parentElement.appendChild(this._container);
    }

    // Create tooltip
    this._tooltipElement = document.createElement('div');
    this._tooltipElement.style.position = 'absolute';
    this._tooltipElement.style.padding = '8px 12px';
    this._tooltipElement.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    this._tooltipElement.style.color = 'white';
    this._tooltipElement.style.borderRadius = '4px';
    this._tooltipElement.style.fontSize = '14px';
    this._tooltipElement.style.pointerEvents = 'none';
    this._tooltipElement.style.opacity = '0';
    this._tooltipElement.style.transition = 'opacity 0.2s';
    this._tooltipElement.style.zIndex = '1001';
    this._tooltipElement.style.maxWidth = '200px';
    this._container.appendChild(this._tooltipElement);

    // Update viewport size
    this._updateViewportSize();

    // Listen for resize
    window.addEventListener('resize', this._onResize);
  }

  /**
   * Add hotspot
   */
  public add(config: HotspotConfig): Hotspot {
    const hotspot = new Hotspot(config);
    this._hotspots.set(hotspot.id, hotspot);

    if (this._container) {
      this._createHotspotElement(hotspot);
    }

    return hotspot;
  }

  /**
   * Remove hotspot
   */
  public remove(id: string): boolean {
    const hotspot = this._hotspots.get(id);
    if (!hotspot) return false;

    if (hotspot.element && hotspot.element.parentElement) {
      hotspot.element.parentElement.removeChild(hotspot.element);
    }

    this._hotspots.delete(id);
    return true;
  }

  /**
   * Get hotspot by id
   */
  public get(id: string): Hotspot | undefined {
    return this._hotspots.get(id);
  }

  /**
   * Get all hotspots
   */
  public getAll(): Hotspot[] {
    return Array.from(this._hotspots.values());
  }

  /**
   * Get hotspots by group
   */
  public getByGroup(group: string): Hotspot[] {
    return this.getAll().filter((h) => h.group === group);
  }

  /**
   * Clear all hotspots
   */
  public clear(): void {
    for (const hotspot of this._hotspots.values()) {
      if (hotspot.element && hotspot.element.parentElement) {
        hotspot.element.parentElement.removeChild(hotspot.element);
      }
    }
    this._hotspots.clear();
  }

  /**
   * Update hotspot screen positions
   */
  public update(
    viewMatrix: Matrix4,
    projectionMatrix: Matrix4,
    cameraPosition: Vector3
  ): void {
    if (!this._enabled) return;

    this._updateViewportSize();

    for (const hotspot of this._hotspots.values()) {
      hotspot.updateScreenPosition(
        viewMatrix,
        projectionMatrix,
        this._viewportWidth,
        this._viewportHeight,
        cameraPosition
      );

      this._updateHotspotElement(hotspot);
    }
  }

  /**
   * Create DOM element for hotspot
   */
  private _createHotspotElement(hotspot: Hotspot): void {
    if (!this._container) return;

    const element = document.createElement('div');
    element.className = `hotspot ${hotspot.className}`;
    element.style.position = 'absolute';
    element.style.transform = 'translate(-50%, -50%)';
    element.style.width = '24px';
    element.style.height = '24px';
    element.style.borderRadius = '50%';
    element.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    element.style.border = '2px solid rgba(0, 0, 0, 0.2)';
    element.style.cursor = 'pointer';
    element.style.pointerEvents = 'auto';
    element.style.display = 'flex';
    element.style.alignItems = 'center';
    element.style.justifyContent = 'center';
    element.style.fontSize = '12px';
    element.style.transition = 'transform 0.2s, box-shadow 0.2s';
    element.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';

    // Add icon or number
    if (hotspot.icon) {
      element.textContent = hotspot.icon;
    } else {
      element.textContent = '•';
    }

    // Event listeners
    element.addEventListener('mouseenter', () => this._onHotspotHoverEnter(hotspot));
    element.addEventListener('mouseleave', () => this._onHotspotHoverExit(hotspot));
    element.addEventListener('click', () => this._onHotspotClick(hotspot));

    hotspot.element = element;
    this._container.appendChild(element);
  }

  /**
   * Update hotspot DOM element position and visibility
   */
  private _updateHotspotElement(hotspot: Hotspot): void {
    if (!hotspot.element) return;

    if (hotspot.visible && !hotspot.occluded) {
      hotspot.element.style.display = 'flex';
      hotspot.element.style.left = `${hotspot.screenX}px`;
      hotspot.element.style.top = `${hotspot.screenY}px`;
    } else {
      hotspot.element.style.display = 'none';
    }
  }

  /**
   * Handle hotspot hover enter
   */
  private _onHotspotHoverEnter(hotspot: Hotspot): void {
    if (!this._enabled) return;

    hotspot.isHovered = true;

    // Animate
    if (this._animateOnHover && hotspot.element) {
      hotspot.element.style.transform = 'translate(-50%, -50%) scale(1.2)';
      hotspot.element.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.3)';
    }

    // Show tooltip
    if (this._showTooltips && this._tooltipElement) {
      this._showTooltip(hotspot);
    }

    // Call handler
    if (hotspot.onHoverEnter) {
      hotspot.onHoverEnter(hotspot);
    }
  }

  /**
   * Handle hotspot hover exit
   */
  private _onHotspotHoverExit(hotspot: Hotspot): void {
    if (!this._enabled) return;

    hotspot.isHovered = false;

    // Reset animation
    if (this._animateOnHover && hotspot.element) {
      hotspot.element.style.transform = 'translate(-50%, -50%) scale(1)';
      hotspot.element.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
    }

    // Hide tooltip
    if (this._tooltipElement) {
      this._hideTooltip();
    }

    // Call handler
    if (hotspot.onHoverExit) {
      hotspot.onHoverExit(hotspot);
    }
  }

  /**
   * Handle hotspot click
   */
  private _onHotspotClick(hotspot: Hotspot): void {
    if (!this._enabled) return;

    if (hotspot.onClick) {
      hotspot.onClick(hotspot);
    }
  }

  /**
   * Show tooltip for hotspot
   */
  private _showTooltip(hotspot: Hotspot): void {
    if (!this._tooltipElement) return;

    this._currentTooltipHotspot = hotspot;

    // Set content
    let content = `<strong>${hotspot.label}</strong>`;
    if (hotspot.content) {
      content += `<br/>${hotspot.content}`;
    }
    this._tooltipElement.innerHTML = content;

    // Position tooltip
    const offset = 10;
    let left = hotspot.screenX;
    let top = hotspot.screenY - 40 - offset;

    // Keep tooltip in viewport
    const tooltipRect = this._tooltipElement.getBoundingClientRect();
    if (left + tooltipRect.width / 2 > this._viewportWidth) {
      left = this._viewportWidth - tooltipRect.width / 2 - offset;
    }
    if (left - tooltipRect.width / 2 < 0) {
      left = tooltipRect.width / 2 + offset;
    }
    if (top < 0) {
      top = hotspot.screenY + 40 + offset;
    }

    this._tooltipElement.style.left = `${left}px`;
    this._tooltipElement.style.top = `${top}px`;
    this._tooltipElement.style.transform = 'translateX(-50%)';
    this._tooltipElement.style.opacity = '1';
  }

  /**
   * Hide tooltip
   */
  private _hideTooltip(): void {
    if (!this._tooltipElement) return;

    this._tooltipElement.style.opacity = '0';
    this._currentTooltipHotspot = null;
  }

  /**
   * Update viewport size
   */
  private _updateViewportSize(): void {
    if (this._canvas) {
      this._viewportWidth = this._canvas.width;
      this._viewportHeight = this._canvas.height;
    }
  }

  /**
   * Handle window resize
   */
  private _onResize = (): void => {
    this._updateViewportSize();
  };

  /**
   * Set enabled state
   */
  public setEnabled(enabled: boolean): void {
    this._enabled = enabled;

    if (!enabled && this._container) {
      this._container.style.display = 'none';
    } else if (this._container) {
      this._container.style.display = 'block';
    }
  }

  /**
   * Set show tooltips
   */
  public setShowTooltips(show: boolean): void {
    this._showTooltips = show;
    if (!show) {
      this._hideTooltip();
    }
  }

  /**
   * Set animate on hover
   */
  public setAnimateOnHover(animate: boolean): void {
    this._animateOnHover = animate;
  }

  /**
   * Dispose manager
   */
  public dispose(): void {
    this.clear();

    if (this._container && this._container.parentElement) {
      this._container.parentElement.removeChild(this._container);
    }

    window.removeEventListener('resize', this._onResize);

    this._container = null;
    this._tooltipElement = null;
  }
}
