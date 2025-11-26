/**
 * @fileoverview Tab container UI component with multiple panels.
 * @module ui/components/TabView
 */

import { UIElement, UIEventType, UIEvent } from '../UIElement';
import { UIText } from '../UIText';
import { Color } from '../../math/Color';

/**
 * Tab data structure
 */
export interface Tab {
  id: string;
  label: string;
  content: UIElement;
  disabled?: boolean;
  closeable?: boolean;
}

/**
 * Tab container with multiple panels and tab navigation.
 * Supports horizontal and vertical tab layouts.
 *
 * @example
 * ```typescript
 * const tabView = new TabView();
 * tabView.setSize(400, 300);
 * tabView.position.set(100, 100);
 *
 * const content1 = new UIElement();
 * const content2 = new UIElement();
 *
 * tabView.addTab({ id: 'tab1', label: 'Tab 1', content: content1 });
 * tabView.addTab({ id: 'tab2', label: 'Tab 2', content: content2 });
 *
 * tabView.onTabChanged((tab) => {
 *   console.log('Active tab:', tab.label);
 * });
 * ```
 */
export class TabView extends UIElement {
  /**
   * Tabs
   */
  protected _tabs: Tab[] = [];

  /**
   * Active tab index
   */
  protected _activeIndex: number = 0;

  /**
   * Tab view width
   */
  public tabViewWidth: number;

  /**
   * Tab view height
   */
  public tabViewHeight: number;

  /**
   * Tab bar height (for horizontal tabs)
   */
  public tabBarHeight: number;

  /**
   * Tab width (for vertical tabs)
   */
  public tabBarWidth: number;

  /**
   * Whether tabs are horizontal (true) or vertical (false)
   */
  public horizontal: boolean;

  /**
   * Background color
   */
  public override backgroundColor: Color;

  /**
   * Tab bar background color
   */
  public tabBarColor: Color;

  /**
   * Active tab color
   */
  public activeTabColor: Color;

  /**
   * Inactive tab color
   */
  public inactiveTabColor: Color;

  /**
   * Text color
   */
  public textColor: Color;

  /**
   * Active text color
   */
  public activeTextColor: Color;

  /**
   * Border color
   */
  public borderColor: Color;

  /**
   * Hovered tab index
   */
  protected _hoveredIndex: number = -1;

  /**
   * Tab changed callback
   */
  protected _tabChangedCallback: ((tab: Tab) => void) | null = null;

  /**
   * Tab closed callback
   */
  protected _tabClosedCallback: ((tab: Tab) => void) | null = null;

  /**
   * Content container
   */
  protected _contentContainer: UIElement;

  /**
   * Tab container
   */
  protected _tabContainer: UIElement;

  /**
   * Creates a new tab view.
   *
   * @example
   * ```typescript
   * const tabs = new TabView();
   * tabs.setSize(500, 400);
   * ```
   */
  constructor() {
    super('TabView');

    this.tabViewWidth = 400;
    this.tabViewHeight = 300;
    this.tabBarHeight = 40;
    this.tabBarWidth = 150;
    this.horizontal = true;

    // Default colors
    this.backgroundColor = Color.white();
    this.tabBarColor = Color.fromHex(0xF5F5F5);
    this.activeTabColor = Color.white();
    this.inactiveTabColor = Color.fromHex(0xE0E0E0);
    this.textColor = Color.fromHex(0x757575);
    this.activeTextColor = Color.fromHex(0x212121);
    this.borderColor = Color.fromHex(0xBDBDBD);

    this.size.set(this.tabViewWidth, this.tabViewHeight);
    this.interactive = true;
    this.blockPointer = true;

    // Create tab container
    this._tabContainer = new UIElement('TabContainer');
    this._tabContainer.size.set(this.tabViewWidth, this.tabBarHeight);
    this._tabContainer.interactive = true;
    this.addChild(this._tabContainer);

    // Create content container
    this._contentContainer = new UIElement('ContentContainer');
    this._contentContainer.position.set(0, this.tabBarHeight);
    this._contentContainer.size.set(this.tabViewWidth, this.tabViewHeight - this.tabBarHeight);
    this.addChild(this._contentContainer);

    // Setup event listeners
    this._tabContainer.addEventListener(UIEventType.Click, this.handleTabClick.bind(this));
    this._tabContainer.addEventListener(UIEventType.PointerMove, this.handleTabHover.bind(this));
    this._tabContainer.addEventListener(UIEventType.PointerLeave, this.handleTabLeave.bind(this));
  }

  /**
   * Gets the tabs.
   */
  get tabs(): readonly Tab[] {
    return this._tabs;
  }

  /**
   * Gets the active tab.
   */
  get activeTab(): Tab | null {
    return this._tabs[this._activeIndex] ?? null;
  }

  /**
   * Gets the active tab index.
   */
  get activeIndex(): number {
    return this._activeIndex;
  }

  /**
   * Adds a tab.
   */
  addTab(tab: Tab): this {
    this._tabs.push(tab);

    // Add content to container (hidden initially)
    tab.content.visible = this._tabs.length === 1;
    this._contentContainer.addChild(tab.content);

    // If this is the first tab, make it active
    if (this._tabs.length === 1) {
      this._activeIndex = 0;
    }

    return this;
  }

  /**
   * Removes a tab by ID.
   */
  removeTab(id: string): this {
    const index = this._tabs.findIndex(tab => tab.id === id);
    if (index !== -1) {
      const tab = this._tabs[index];

      // Remove content
      this._contentContainer.removeChild(tab.content);

      // Remove tab
      this._tabs.splice(index, 1);

      // Update active index
      if (this._activeIndex >= this._tabs.length) {
        this._activeIndex = Math.max(0, this._tabs.length - 1);
      }

      // Show new active tab content
      this.updateContentVisibility();

      if (this._tabClosedCallback) {
        this._tabClosedCallback(tab);
      }
    }

    return this;
  }

  /**
   * Activates a tab by index.
   */
  setActiveIndex(index: number): this {
    if (index >= 0 && index < this._tabs.length && index !== this._activeIndex) {
      const tab = this._tabs[index];

      if (!tab.disabled) {
        this._activeIndex = index;
        this.updateContentVisibility();

        if (this._tabChangedCallback) {
          this._tabChangedCallback(tab);
        }
      }
    }

    return this;
  }

  /**
   * Activates a tab by ID.
   */
  setActiveTab(id: string): this {
    const index = this._tabs.findIndex(tab => tab.id === id);
    if (index !== -1) {
      this.setActiveIndex(index);
    }
    return this;
  }

  /**
   * Updates content visibility based on active tab.
   */
  protected updateContentVisibility(): void {
    for (let i = 0; i < this._tabs.length; i++) {
      this._tabs[i].content.visible = i === this._activeIndex;
    }
  }

  /**
   * Gets tab bounds for rendering.
   */
  protected getTabBounds(index: number): { x: number; y: number; width: number; height: number } {
    if (this.horizontal) {
      const tabWidth = this.tabViewWidth / this._tabs.length;
      return {
        x: index * tabWidth,
        y: 0,
        width: tabWidth,
        height: this.tabBarHeight
      };
    } else {
      return {
        x: 0,
        y: index * this.tabBarHeight,
        width: this.tabBarWidth,
        height: this.tabBarHeight
      };
    }
  }

  /**
   * Gets the tab index at a position.
   */
  protected getTabAtPosition(localX: number, localY: number): number {
    for (let i = 0; i < this._tabs.length; i++) {
      const bounds = this.getTabBounds(i);
      if (
        localX >= bounds.x &&
        localX <= bounds.x + bounds.width &&
        localY >= bounds.y &&
        localY <= bounds.y + bounds.height
      ) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Handles tab click event.
   */
  protected handleTabClick(event: UIEvent): void {
    const localPos = this._tabContainer.worldToLocal(event.position);
    const index = this.getTabAtPosition(localPos.x, localPos.y);

    if (index !== -1) {
      this.setActiveIndex(index);
    }
  }

  /**
   * Handles tab hover event.
   */
  protected handleTabHover(event: UIEvent): void {
    const localPos = this._tabContainer.worldToLocal(event.position);
    this._hoveredIndex = this.getTabAtPosition(localPos.x, localPos.y);
  }

  /**
   * Handles tab leave event.
   */
  protected handleTabLeave(event: UIEvent): void {
    this._hoveredIndex = -1;
  }

  /**
   * Sets the tab changed callback.
   */
  onTabChanged(callback: (tab: Tab) => void): this {
    this._tabChangedCallback = callback;
    return this;
  }

  /**
   * Sets the tab closed callback.
   */
  onTabClosed(callback: (tab: Tab) => void): this {
    this._tabClosedCallback = callback;
    return this;
  }

  /**
   * Renders the tab view.
   */
  override render(context: CanvasRenderingContext2D): void {
    if (!this.visible || this.worldAlpha <= 0) {
      return;
    }

    const pos = this.worldPosition;
    const alpha = this.worldAlpha;

    context.save();
    context.globalAlpha = alpha;

    const x = pos.x - this.tabViewWidth * this.pivot.x;
    const y = pos.y - this.tabViewHeight * this.pivot.y;

    // Draw tab bar background
    context.fillStyle = this.tabBarColor.toCSSString();
    if (this.horizontal) {
      context.fillRect(x, y, this.tabViewWidth, this.tabBarHeight);
    } else {
      context.fillRect(x, y, this.tabBarWidth, this.tabViewHeight);
    }

    // Draw tabs
    for (let i = 0; i < this._tabs.length; i++) {
      const tab = this._tabs[i];
      const bounds = this.getTabBounds(i);
      const isActive = i === this._activeIndex;
      const isHovered = i === this._hoveredIndex;

      const tabX = x + bounds.x;
      const tabY = y + bounds.y;

      // Draw tab background
      const tabColor = isActive
        ? this.activeTabColor
        : (isHovered && !tab.disabled ? this.activeTabColor.lerp(this.inactiveTabColor, 0.5) : this.inactiveTabColor);

      context.fillStyle = tabColor.toCSSString();
      context.fillRect(tabX, tabY, bounds.width, bounds.height);

      // Draw tab border
      context.strokeStyle = this.borderColor.toCSSString();
      context.lineWidth = 1;
      context.strokeRect(tabX, tabY, bounds.width, bounds.height);

      // Draw tab text
      const tabTextColor = isActive ? this.activeTextColor : this.textColor;
      context.fillStyle = tab.disabled
        ? Color.fromHex(0xBDBDBD).toCSSString()
        : tabTextColor.toCSSString();
      context.font = isActive ? 'bold 14px sans-serif' : '14px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(
        tab.label,
        tabX + bounds.width / 2,
        tabY + bounds.height / 2
      );
    }

    // Draw content area border
    const contentX = this.horizontal ? x : x + this.tabBarWidth;
    const contentY = this.horizontal ? y + this.tabBarHeight : y;
    const contentWidth = this.horizontal ? this.tabViewWidth : this.tabViewWidth - this.tabBarWidth;
    const contentHeight = this.horizontal ? this.tabViewHeight - this.tabBarHeight : this.tabViewHeight;

    context.strokeStyle = this.borderColor.toCSSString();
    context.lineWidth = 1;
    context.strokeRect(contentX, contentY, contentWidth, contentHeight);

    context.restore();
  }

  /**
   * Sets the tab view size.
   */
  setSize(width: number, height: number): this {
    this.tabViewWidth = width;
    this.tabViewHeight = height;
    this.size.set(width, height);

    if (this.horizontal) {
      this._tabContainer.size.set(width, this.tabBarHeight);
      this._contentContainer.position.set(0, this.tabBarHeight);
      this._contentContainer.size.set(width, height - this.tabBarHeight);
    } else {
      this._tabContainer.size.set(this.tabBarWidth, height);
      this._contentContainer.position.set(this.tabBarWidth, 0);
      this._contentContainer.size.set(width - this.tabBarWidth, height);
    }

    return this;
  }
}
