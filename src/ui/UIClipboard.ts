import { UIElement } from './UIElement';
import { Logger } from '../core/Logger';

const logger = Logger.create('UIClipboard');

/**
 * Clipboard data types.
 */
export enum ClipboardDataType {
  Text = 'text',
  HTML = 'html',
  Image = 'image',
  Custom = 'custom',
}

/**
 * Clipboard data container.
 */
export interface ClipboardData {
  type: ClipboardDataType;
  data: string | Blob;
  metadata?: Record<string, unknown>;
}

/**
 * Clipboard operation result.
 */
export interface ClipboardResult {
  success: boolean;
  error?: string;
}

/**
 * Clipboard integration for UI elements.
 * Provides copy, cut, and paste functionality with support for multiple data types.
 */
export class UIClipboard {
  private static internalClipboard: ClipboardData | null = null;
  private static _cutElement: UIElement | null = null;

  /**
   * Copies text to the clipboard.
   *
   * @param text - Text to copy
   * @returns Result of the operation
   */
  static async copyText(text: string): Promise<ClipboardResult> {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        logger.info('Text copied to system clipboard');
        return { success: true };
      } else {
        this.internalClipboard = {
          type: ClipboardDataType.Text,
          data: text,
        };
        logger.info('Text copied to internal clipboard');
        return { success: true };
      }
    } catch (error) {
      logger.error('Failed to copy text', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Pastes text from the clipboard.
   *
   * @returns Pasted text or null if unavailable
   */
  static async pasteText(): Promise<string | null> {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        logger.info('Text pasted from system clipboard');
        return text;
      } else {
        if (this.internalClipboard?.type === ClipboardDataType.Text) {
          logger.info('Text pasted from internal clipboard');
          return this.internalClipboard.data as string;
        }
        return null;
      }
    } catch (error) {
      logger.error('Failed to paste text', error);
      return null;
    }
  }

  /**
   * Copies custom data to the clipboard.
   *
   * @param data - Data to copy
   * @param metadata - Optional metadata
   * @returns Result of the operation
   */
  static copyData(data: ClipboardData): ClipboardResult {
    try {
      this.internalClipboard = data;
      logger.info(`Copied ${data.type} data to internal clipboard`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to copy data', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Pastes custom data from the clipboard.
   *
   * @returns Pasted data or null if unavailable
   */
  static pasteData(): ClipboardData | null {
    if (this.internalClipboard) {
      logger.info(`Pasted ${this.internalClipboard.type} data from internal clipboard`);
      return this.internalClipboard;
    }
    return null;
  }

  /**
   * Copies a UI element to the clipboard.
   *
   * @param element - Element to copy
   * @returns Result of the operation
   */
  static copyElement(element: UIElement): ClipboardResult {
    try {
      const serialized = JSON.stringify({
        type: element.constructor.name,
        x: element.position.x,
        y: element.position.y,
        width: element.size.x,
        height: element.size.y,
        visible: element.visible,
        enabled: element.enabled,
        alpha: element.alpha,
      });

      this.internalClipboard = {
        type: ClipboardDataType.Custom,
        data: serialized,
        metadata: { elementType: element.constructor.name },
      };

      logger.info(`Copied element ${element.constructor.name} to clipboard`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to copy element', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Cuts a UI element to the clipboard (copy + mark for removal).
   *
   * @param element - Element to cut
   * @returns Result of the operation
   */
  static cutElement(element: UIElement): ClipboardResult {
    const result = this.copyElement(element);
    if (result.success) {
      this._cutElement = element;
      logger.info('Element cut to clipboard');
    }
    return result;
  }

  /**
   * Gets the element that was cut (if any).
   *
   * @returns Cut element or null
   */
  static getCutElement(): UIElement | null {
    return this._cutElement;
  }

  /**
   * Clears the cut element reference.
   */
  static clearCutElement(): void {
    this._cutElement = null;
    logger.debug('Cut element reference cleared');
  }

  /**
   * Checks if the clipboard contains data of a specific type.
   *
   * @param type - Data type to check for
   * @returns True if clipboard contains data of the specified type
   */
  static hasData(type: ClipboardDataType): boolean {
    return this.internalClipboard?.type === type;
  }

  /**
   * Checks if the clipboard is empty.
   *
   * @returns True if clipboard is empty
   */
  static isEmpty(): boolean {
    return this.internalClipboard === null;
  }

  /**
   * Clears the clipboard.
   */
  static clear(): void {
    this.internalClipboard = null;
    this._cutElement = null;
    logger.debug('Clipboard cleared');
  }

  /**
   * Checks if the system clipboard API is available.
   *
   * @returns True if system clipboard is available
   */
  static isSystemClipboardAvailable(): boolean {
    return typeof navigator !== 'undefined' && navigator.clipboard !== undefined;
  }

  /**
   * Copies HTML content to the clipboard.
   *
   * @param html - HTML content to copy
   * @returns Result of the operation
   */
  static async copyHTML(html: string): Promise<ClipboardResult> {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        const blob = new Blob([html], { type: 'text/html' });
        const clipboardItem = new ClipboardItem({ 'text/html': blob });
        await navigator.clipboard.write([clipboardItem]);
        logger.info('HTML copied to system clipboard');
        return { success: true };
      } else {
        this.internalClipboard = {
          type: ClipboardDataType.HTML,
          data: html,
        };
        logger.info('HTML copied to internal clipboard');
        return { success: true };
      }
    } catch (error) {
      logger.error('Failed to copy HTML', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Copies an image to the clipboard.
   *
   * @param imageBlob - Image blob to copy
   * @returns Result of the operation
   */
  static async copyImage(imageBlob: Blob): Promise<ClipboardResult> {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        const clipboardItem = new ClipboardItem({ [imageBlob.type]: imageBlob });
        await navigator.clipboard.write([clipboardItem]);
        logger.info('Image copied to system clipboard');
        return { success: true };
      } else {
        this.internalClipboard = {
          type: ClipboardDataType.Image,
          data: imageBlob,
        };
        logger.info('Image copied to internal clipboard');
        return { success: true };
      }
    } catch (error) {
      logger.error('Failed to copy image', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Requests clipboard read permission.
   *
   * @returns True if permission granted
   */
  static async requestPermission(): Promise<boolean> {
    try {
      if (typeof navigator !== 'undefined' && navigator.permissions) {
        const result = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName });
        logger.info(`Clipboard permission: ${result.state}`);
        return result.state === 'granted';
      }
      return false;
    } catch (error) {
      logger.error('Failed to request clipboard permission', error);
      return false;
    }
  }
}
