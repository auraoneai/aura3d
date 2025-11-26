import { UIElement } from './UIElement';
import { Logger } from '../core/Logger';

const logger = Logger.create('UIAccessibility');

/**
 * ARIA role types for accessibility.
 */
export enum AriaRole {
  Button = 'button',
  Checkbox = 'checkbox',
  Dialog = 'dialog',
  Link = 'link',
  Menu = 'menu',
  MenuItem = 'menuitem',
  Navigation = 'navigation',
  ProgressBar = 'progressbar',
  Radio = 'radio',
  Slider = 'slider',
  Tab = 'tab',
  TabPanel = 'tabpanel',
  Textbox = 'textbox',
  Tooltip = 'tooltip',
}

/**
 * Accessibility properties for UI elements.
 */
export interface AccessibilityProps {
  /**
   * ARIA role.
   */
  role?: AriaRole;

  /**
   * Accessible label.
   */
  label?: string;

  /**
   * Accessible description.
   */
  description?: string;

  /**
   * Whether element is focusable.
   */
  focusable?: boolean;

  /**
   * Tab index for keyboard navigation.
   */
  tabIndex?: number;

  /**
   * Whether element is disabled.
   */
  disabled?: boolean;

  /**
   * Whether element is required.
   */
  required?: boolean;

  /**
   * Whether element is read-only.
   */
  readonly?: boolean;

  /**
   * Current value (for form controls).
   */
  value?: string | number;

  /**
   * Minimum value (for sliders, progress bars).
   */
  valueMin?: number;

  /**
   * Maximum value (for sliders, progress bars).
   */
  valueMax?: number;

  /**
   * Checked state (for checkboxes, radios).
   */
  checked?: boolean;

  /**
   * Expanded state (for collapsible elements).
   */
  expanded?: boolean;
}

/**
 * Focus management for keyboard navigation.
 */
class FocusManager {
  private focusableElements: UIElement[] = [];
  private currentFocusIndex: number = -1;

  /**
   * Registers a focusable element.
   *
   * @param element - Element to register
   */
  register(element: UIElement): void {
    if (!this.focusableElements.includes(element)) {
      this.focusableElements.push(element);
      this.sortByTabIndex();
      logger.debug('Registered focusable element');
    }
  }

  /**
   * Unregisters a focusable element.
   *
   * @param element - Element to unregister
   */
  unregister(element: UIElement): void {
    const index = this.focusableElements.indexOf(element);
    if (index !== -1) {
      this.focusableElements.splice(index, 1);
      if (this.currentFocusIndex >= index && this.currentFocusIndex > 0) {
        this.currentFocusIndex--;
      }
      logger.debug('Unregistered focusable element');
    }
  }

  /**
   * Moves focus to the next element.
   */
  focusNext(): void {
    if (this.focusableElements.length === 0) {
      return;
    }

    this.currentFocusIndex = (this.currentFocusIndex + 1) % this.focusableElements.length;
    const element = this.focusableElements[this.currentFocusIndex];

    if (element.enabled && element.visible) {
      this.setFocus(element);
    } else {
      this.focusNext();
    }
  }

  /**
   * Moves focus to the previous element.
   */
  focusPrevious(): void {
    if (this.focusableElements.length === 0) {
      return;
    }

    this.currentFocusIndex = (this.currentFocusIndex - 1 + this.focusableElements.length) % this.focusableElements.length;
    const element = this.focusableElements[this.currentFocusIndex];

    if (element.enabled && element.visible) {
      this.setFocus(element);
    } else {
      this.focusPrevious();
    }
  }

  /**
   * Sets focus to a specific element.
   *
   * @param element - Element to focus
   */
  setFocus(element: UIElement): void {
    const index = this.focusableElements.indexOf(element);
    if (index !== -1) {
      this.currentFocusIndex = index;
      logger.debug('Focus set to element');
    }
  }

  /**
   * Gets the currently focused element.
   *
   * @returns Currently focused element or null
   */
  getFocused(): UIElement | null {
    if (this.currentFocusIndex >= 0 && this.currentFocusIndex < this.focusableElements.length) {
      return this.focusableElements[this.currentFocusIndex];
    }
    return null;
  }

  /**
   * Clears focus.
   */
  clearFocus(): void {
    this.currentFocusIndex = -1;
    logger.debug('Focus cleared');
  }

  /**
   * Sorts elements by tab index.
   */
  private sortByTabIndex(): void {
    this.focusableElements.sort((a, b) => {
      const aProps = UIAccessibility.getProps(a);
      const bProps = UIAccessibility.getProps(b);
      const aIndex = aProps?.tabIndex ?? 0;
      const bIndex = bProps?.tabIndex ?? 0;
      return aIndex - bIndex;
    });
  }

  /**
   * Clears all registered elements.
   */
  clear(): void {
    this.focusableElements = [];
    this.currentFocusIndex = -1;
    logger.debug('Focus manager cleared');
  }
}

/**
 * Accessibility utilities for UI elements.
 * Provides screen reader support, high contrast mode, and keyboard navigation.
 */
export class UIAccessibility {
  private static elementProps: Map<UIElement, AccessibilityProps> = new Map();
  private static focusManager: FocusManager = new FocusManager();
  private static highContrastMode: boolean = false;
  private static screenReaderEnabled: boolean = false;
  private static announcements: string[] = [];

  /**
   * Sets accessibility properties for an element.
   *
   * @param element - Element to configure
   * @param props - Accessibility properties
   */
  static setProps(element: UIElement, props: AccessibilityProps): void {
    this.elementProps.set(element, props);

    if (props.focusable) {
      this.focusManager.register(element);
    } else {
      this.focusManager.unregister(element);
    }

    logger.debug('Accessibility properties set for element');
  }

  /**
   * Gets accessibility properties for an element.
   *
   * @param element - Element to get properties for
   * @returns Accessibility properties or undefined
   */
  static getProps(element: UIElement): AccessibilityProps | undefined {
    return this.elementProps.get(element);
  }

  /**
   * Removes accessibility properties from an element.
   *
   * @param element - Element to remove properties from
   */
  static removeProps(element: UIElement): void {
    this.elementProps.delete(element);
    this.focusManager.unregister(element);
    logger.debug('Accessibility properties removed from element');
  }

  /**
   * Moves focus to the next focusable element.
   */
  static focusNext(): void {
    this.focusManager.focusNext();
    const focused = this.focusManager.getFocused();
    if (focused) {
      const props = this.getProps(focused);
      if (props?.label) {
        this.announce(`Focused: ${props.label}`);
      }
    }
  }

  /**
   * Moves focus to the previous focusable element.
   */
  static focusPrevious(): void {
    this.focusManager.focusPrevious();
    const focused = this.focusManager.getFocused();
    if (focused) {
      const props = this.getProps(focused);
      if (props?.label) {
        this.announce(`Focused: ${props.label}`);
      }
    }
  }

  /**
   * Sets focus to a specific element.
   *
   * @param element - Element to focus
   */
  static setFocus(element: UIElement): void {
    this.focusManager.setFocus(element);
    const props = this.getProps(element);
    if (props?.label) {
      this.announce(`Focused: ${props.label}`);
    }
  }

  /**
   * Gets the currently focused element.
   *
   * @returns Currently focused element or null
   */
  static getFocused(): UIElement | null {
    return this.focusManager.getFocused();
  }

  /**
   * Clears focus from all elements.
   */
  static clearFocus(): void {
    this.focusManager.clearFocus();
  }

  /**
   * Enables high contrast mode.
   */
  static enableHighContrast(): void {
    this.highContrastMode = true;
    logger.info('High contrast mode enabled');
  }

  /**
   * Disables high contrast mode.
   */
  static disableHighContrast(): void {
    this.highContrastMode = false;
    logger.info('High contrast mode disabled');
  }

  /**
   * Checks if high contrast mode is enabled.
   *
   * @returns True if high contrast mode is enabled
   */
  static isHighContrastMode(): boolean {
    return this.highContrastMode;
  }

  /**
   * Enables screen reader announcements.
   */
  static enableScreenReader(): void {
    this.screenReaderEnabled = true;
    logger.info('Screen reader enabled');
  }

  /**
   * Disables screen reader announcements.
   */
  static disableScreenReader(): void {
    this.screenReaderEnabled = false;
    logger.info('Screen reader disabled');
  }

  /**
   * Checks if screen reader is enabled.
   *
   * @returns True if screen reader is enabled
   */
  static isScreenReaderEnabled(): boolean {
    return this.screenReaderEnabled;
  }

  /**
   * Announces a message to screen readers.
   *
   * @param message - Message to announce
   * @param priority - Priority level (default: 'polite')
   */
  static announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    if (!this.screenReaderEnabled) {
      return;
    }

    this.announcements.push(message);
    logger.debug(`Screen reader announcement (${priority}): ${message}`);

    if (typeof window !== 'undefined') {
      const element = document.createElement('div');
      element.setAttribute('role', 'status');
      element.setAttribute('aria-live', priority);
      element.setAttribute('aria-atomic', 'true');
      element.style.position = 'absolute';
      element.style.left = '-10000px';
      element.style.width = '1px';
      element.style.height = '1px';
      element.style.overflow = 'hidden';
      element.textContent = message;
      document.body.appendChild(element);

      setTimeout(() => {
        document.body.removeChild(element);
      }, 1000);
    }
  }

  /**
   * Gets recent screen reader announcements.
   *
   * @param count - Number of recent announcements to get
   * @returns Array of recent announcements
   */
  static getRecentAnnouncements(count: number = 10): string[] {
    return this.announcements.slice(-count);
  }

  /**
   * Generates an accessible description for an element.
   *
   * @param element - Element to describe
   * @returns Accessible description
   */
  static describe(element: UIElement): string {
    const props = this.getProps(element);
    if (!props) {
      return 'UI Element';
    }

    const parts: string[] = [];

    if (props.label) {
      parts.push(props.label);
    }

    if (props.role) {
      parts.push(props.role);
    }

    if (props.disabled) {
      parts.push('disabled');
    }

    if (props.readonly) {
      parts.push('read-only');
    }

    if (props.required) {
      parts.push('required');
    }

    if (props.checked !== undefined) {
      parts.push(props.checked ? 'checked' : 'unchecked');
    }

    if (props.expanded !== undefined) {
      parts.push(props.expanded ? 'expanded' : 'collapsed');
    }

    if (props.value !== undefined) {
      parts.push(`value: ${props.value}`);
    }

    if (props.description) {
      parts.push(props.description);
    }

    return parts.join(', ');
  }

  /**
   * Clears all accessibility data.
   */
  static clear(): void {
    this.elementProps.clear();
    this.focusManager.clear();
    this.announcements = [];
    logger.debug('Accessibility data cleared');
  }
}
