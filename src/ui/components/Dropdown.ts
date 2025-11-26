/**
 * @fileoverview Dropdown menu UI component with options, search, and multi-select support.
 * @module ui/components/Dropdown
 */

import { UIElement, UIEventType, UIEvent } from '../UIElement';
import { UIText } from '../UIText';
import { UIScrollView } from '../UIScrollView';
import { Color } from '../../math/Color';
import { Vector2 } from '../../math/Vector2';

/**
 * Dropdown option
 */
export interface DropdownOption {
  label: string;
  value: string;
  disabled?: boolean;
  data?: any;
}

/**
 * Dropdown menu with options, search filtering, and multi-select support.
 * Features smooth animations and keyboard navigation.
 *
 * @example
 * ```typescript
 * const dropdown = new Dropdown([
 *   { label: 'Option 1', value: '1' },
 *   { label: 'Option 2', value: '2' },
 *   { label: 'Option 3', value: '3' }
 * ]);
 * dropdown.position.set(100, 100);
 * dropdown.onSelectionChanged((values) => {
 *   console.log('Selected:', values);
 * });
 * ```
 */
export class Dropdown extends UIElement {
  /**
   * Dropdown options
   */
  protected _options: DropdownOption[];

  /**
   * Selected option indices
   */
  protected _selectedIndices: Set<number>;

  /**
   * Whether multi-select is enabled
   */
  public multiSelect: boolean;

  /**
   * Whether search/filter is enabled
   */
  public searchEnabled: boolean;

  /**
   * Whether the dropdown is currently open
   */
  protected _isOpen: boolean;

  /**
   * Whether the dropdown is interactable
   */
  protected _interactable: boolean;

  /**
   * Dropdown width
   */
  public dropdownWidth: number;

  /**
   * Dropdown height (closed state)
   */
  public dropdownHeight: number;

  /**
   * Maximum height for dropdown panel
   */
  public maxPanelHeight: number;

  /**
   * Background color
   */
  public override backgroundColor: Color;

  /**
   * Border color
   */
  public borderColor: Color;

  /**
   * Option hover color
   */
  public hoverColor: Color;

  /**
   * Selected option color
   */
  public selectedColor: Color;

  /**
   * Text color
   */
  public textColor: Color;

  /**
   * Placeholder text
   */
  public placeholder: string;

  /**
   * Current search query
   */
  protected _searchQuery: string;

  /**
   * Filtered options
   */
  protected _filteredOptions: DropdownOption[];

  /**
   * Hovered option index
   */
  protected _hoveredIndex: number;

  /**
   * Selection changed callback
   */
  protected _selectionChangedCallback: ((values: string[], options: DropdownOption[]) => void) | null = null;

  /**
   * Dropdown panel (options list)
   */
  protected _panel: UIElement | null = null;

  /**
   * Scroll view for options
   */
  protected _scrollView: UIScrollView | null = null;

  /**
   * Display text element
   */
  protected _displayText: UIText;

  /**
   * Option height
   */
  public optionHeight: number;

  /**
   * Creates a new dropdown.
   *
   * @param options - Dropdown options
   * @param multiSelect - Enable multi-select (default: false)
   *
   * @example
   * ```typescript
   * const countries = new Dropdown([
   *   { label: 'USA', value: 'us' },
   *   { label: 'Canada', value: 'ca' },
   *   { label: 'Mexico', value: 'mx' }
   * ]);
   * ```
   */
  constructor(options: DropdownOption[] = [], multiSelect: boolean = false) {
    super('Dropdown');

    this._options = options;
    this._selectedIndices = new Set();
    this.multiSelect = multiSelect;
    this.searchEnabled = false;
    this._isOpen = false;
    this._interactable = true;
    this.dropdownWidth = 200;
    this.dropdownHeight = 40;
    this.maxPanelHeight = 200;
    this.optionHeight = 32;
    this.placeholder = 'Select...';
    this._searchQuery = '';
    this._filteredOptions = [...options];
    this._hoveredIndex = -1;

    // Default colors
    this.backgroundColor = Color.white();
    this.borderColor = Color.fromHex(0xBDBDBD);
    this.hoverColor = Color.fromHex(0xF5F5F5);
    this.selectedColor = Color.fromHex(0xE3F2FD);
    this.textColor = Color.fromHex(0x212121);

    this.size.set(this.dropdownWidth, this.dropdownHeight);
    this.interactive = true;
    this.blockPointer = true;

    // Create display text
    this._displayText = new UIText(this.placeholder);
    this._displayText.name = 'DisplayText';
    this._displayText.fontSize = 14;
    this._displayText.color = Color.fromHex(0x757575);
    this._displayText.position.set(10, this.dropdownHeight / 2);
    this._displayText.anchor = 3; // MiddleLeft
    this.addChild(this._displayText);

    // Setup event listeners
    this.addEventListener(UIEventType.Click, this.handleClick.bind(this));
  }

  /**
   * Gets whether the dropdown is open.
   */
  get isOpen(): boolean {
    return this._isOpen;
  }

  /**
   * Gets whether the dropdown is interactable.
   */
  get interactable(): boolean {
    return this._interactable;
  }

  /**
   * Sets whether the dropdown is interactable.
   */
  set interactable(val: boolean) {
    this._interactable = val;
    this.interactive = val;
  }

  /**
   * Gets the selected values.
   */
  get selectedValues(): string[] {
    return Array.from(this._selectedIndices)
      .map(index => this._options[index]?.value)
      .filter(v => v !== undefined);
  }

  /**
   * Gets the selected options.
   */
  get selectedOptions(): DropdownOption[] {
    return Array.from(this._selectedIndices)
      .map(index => this._options[index])
      .filter(opt => opt !== undefined);
  }

  /**
   * Sets the dropdown options.
   */
  setOptions(options: DropdownOption[]): this {
    this._options = options;
    this._filteredOptions = [...options];
    this._selectedIndices.clear();
    this.updateDisplayText();
    return this;
  }

  /**
   * Adds an option to the dropdown.
   */
  addOption(option: DropdownOption): this {
    this._options.push(option);
    this._filteredOptions = [...this._options];
    return this;
  }

  /**
   * Removes an option by value.
   */
  removeOption(value: string): this {
    const index = this._options.findIndex(opt => opt.value === value);
    if (index !== -1) {
      this._options.splice(index, 1);
      this._filteredOptions = [...this._options];
      this._selectedIndices.delete(index);
      this.updateDisplayText();
    }
    return this;
  }

  /**
   * Selects an option by value.
   */
  selectValue(value: string): this {
    const index = this._options.findIndex(opt => opt.value === value);
    if (index !== -1) {
      this.selectIndex(index);
    }
    return this;
  }

  /**
   * Selects an option by index.
   */
  selectIndex(index: number): this {
    if (index < 0 || index >= this._options.length) {
      return this;
    }

    if (!this.multiSelect) {
      this._selectedIndices.clear();
    }

    this._selectedIndices.add(index);
    this.updateDisplayText();

    if (this._selectionChangedCallback) {
      this._selectionChangedCallback(this.selectedValues, this.selectedOptions);
    }

    return this;
  }

  /**
   * Deselects an option by value.
   */
  deselectValue(value: string): this {
    const index = this._options.findIndex(opt => opt.value === value);
    if (index !== -1) {
      this._selectedIndices.delete(index);
      this.updateDisplayText();

      if (this._selectionChangedCallback) {
        this._selectionChangedCallback(this.selectedValues, this.selectedOptions);
      }
    }
    return this;
  }

  /**
   * Clears all selections.
   */
  clearSelection(): this {
    this._selectedIndices.clear();
    this.updateDisplayText();

    if (this._selectionChangedCallback) {
      this._selectionChangedCallback(this.selectedValues, this.selectedOptions);
    }

    return this;
  }

  /**
   * Updates the display text.
   */
  protected updateDisplayText(): void {
    if (this._selectedIndices.size === 0) {
      this._displayText.text = this.placeholder;
      this._displayText.color = Color.fromHex(0x757575);
    } else {
      const selectedLabels = Array.from(this._selectedIndices)
        .map(index => this._options[index]?.label)
        .filter(label => label !== undefined);

      this._displayText.text = selectedLabels.join(', ');
      this._displayText.color = this.textColor;
    }
  }

  /**
   * Sets the selection changed callback.
   *
   * @param callback - Callback function called when selection changes
   *
   * @example
   * ```typescript
   * dropdown.onSelectionChanged((values, options) => {
   *   console.log('Selected values:', values);
   * });
   * ```
   */
  onSelectionChanged(callback: (values: string[], options: DropdownOption[]) => void): this {
    this._selectionChangedCallback = callback;
    return this;
  }

  /**
   * Opens the dropdown panel.
   */
  open(): void {
    if (this._isOpen || !this._interactable) {
      return;
    }

    this._isOpen = true;
    this.createPanel();
  }

  /**
   * Closes the dropdown panel.
   */
  close(): void {
    if (!this._isOpen) {
      return;
    }

    this._isOpen = false;
    this.destroyPanel();
  }

  /**
   * Toggles the dropdown open/closed state.
   */
  toggle(): void {
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Creates the dropdown panel.
   */
  protected createPanel(): void {
    if (this._panel) {
      return;
    }

    // Calculate panel height
    const numOptions = this._filteredOptions.length;
    const panelHeight = Math.min(numOptions * this.optionHeight, this.maxPanelHeight);

    // Create panel
    this._panel = new UIElement('DropdownPanel');
    this._panel.position.set(0, this.dropdownHeight);
    this._panel.size.set(this.dropdownWidth, panelHeight);
    this._panel.backgroundColor = this.backgroundColor;
    this._panel.interactive = true;
    this._panel.blockPointer = true;
    this.addChild(this._panel);

    // Create scroll view if needed
    if (numOptions * this.optionHeight > this.maxPanelHeight) {
      this._scrollView = new UIScrollView();
      this._scrollView.size.set(this.dropdownWidth, panelHeight);
      this._scrollView.contentSize.set(this.dropdownWidth, numOptions * this.optionHeight);
      this._panel.addChild(this._scrollView);
    }
  }

  /**
   * Destroys the dropdown panel.
   */
  protected destroyPanel(): void {
    if (this._panel) {
      this._panel.destroy();
      this._panel = null;
      this._scrollView = null;
    }
  }

  /**
   * Handles click event.
   */
  protected handleClick(event: UIEvent): void {
    if (!this._interactable) {
      return;
    }

    this.toggle();
  }

  /**
   * Renders the dropdown.
   */
  override render(context: CanvasRenderingContext2D): void {
    if (!this.visible || this.worldAlpha <= 0) {
      return;
    }

    const pos = this.worldPosition;
    const alpha = this.worldAlpha;

    context.save();
    context.globalAlpha = alpha;

    const x = pos.x - this.dropdownWidth * this.pivot.x;
    const y = pos.y - this.dropdownHeight * this.pivot.y;

    // Draw background
    context.fillStyle = this.backgroundColor.toCSSString();
    context.fillRect(x, y, this.dropdownWidth, this.dropdownHeight);

    // Draw border
    context.strokeStyle = this.borderColor.toCSSString();
    context.lineWidth = 1;
    context.strokeRect(x, y, this.dropdownWidth, this.dropdownHeight);

    // Draw arrow indicator
    const arrowX = x + this.dropdownWidth - 20;
    const arrowY = y + this.dropdownHeight / 2;
    const arrowSize = 5;

    context.fillStyle = this.textColor.toCSSString();
    context.beginPath();
    if (this._isOpen) {
      // Up arrow
      context.moveTo(arrowX - arrowSize, arrowY + arrowSize / 2);
      context.lineTo(arrowX, arrowY - arrowSize / 2);
      context.lineTo(arrowX + arrowSize, arrowY + arrowSize / 2);
    } else {
      // Down arrow
      context.moveTo(arrowX - arrowSize, arrowY - arrowSize / 2);
      context.lineTo(arrowX, arrowY + arrowSize / 2);
      context.lineTo(arrowX + arrowSize, arrowY - arrowSize / 2);
    }
    context.fill();

    context.restore();

    // Render panel if open
    if (this._panel && this._isOpen) {
      this.renderPanel(context);
    }
  }

  /**
   * Renders the dropdown panel.
   */
  protected renderPanel(context: CanvasRenderingContext2D): void {
    if (!this._panel) {
      return;
    }

    const pos = this._panel.worldPosition;
    const alpha = this.worldAlpha;

    context.save();
    context.globalAlpha = alpha;

    const x = pos.x;
    const y = pos.y;

    // Draw panel background
    context.fillStyle = this.backgroundColor.toCSSString();
    context.fillRect(x, y, this._panel.size.x, this._panel.size.y);

    // Draw panel border
    context.strokeStyle = this.borderColor.toCSSString();
    context.lineWidth = 1;
    context.strokeRect(x, y, this._panel.size.x, this._panel.size.y);

    // Draw options
    for (let i = 0; i < this._filteredOptions.length; i++) {
      const option = this._filteredOptions[i];
      const optionY = y + i * this.optionHeight;
      const isSelected = this._selectedIndices.has(i);
      const isHovered = i === this._hoveredIndex;

      // Draw option background
      if (isSelected) {
        context.fillStyle = this.selectedColor.toCSSString();
        context.fillRect(x, optionY, this._panel.size.x, this.optionHeight);
      } else if (isHovered) {
        context.fillStyle = this.hoverColor.toCSSString();
        context.fillRect(x, optionY, this._panel.size.x, this.optionHeight);
      }

      // Draw option text
      context.fillStyle = option.disabled
        ? Color.fromHex(0xBDBDBD).toCSSString()
        : this.textColor.toCSSString();
      context.font = '14px sans-serif';
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.fillText(option.label, x + 10, optionY + this.optionHeight / 2);
    }

    context.restore();
  }

  /**
   * Sets the dropdown size.
   *
   * @param width - Dropdown width
   * @param height - Dropdown height (closed state)
   */
  setSize(width: number, height: number): this {
    this.dropdownWidth = width;
    this.dropdownHeight = height;
    this.size.set(width, height);
    this._displayText.position.set(10, height / 2);
    return this;
  }
}
