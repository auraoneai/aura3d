/**
 * @fileoverview Hierarchical tree view UI component with expand/collapse and lazy loading support.
 * @module ui/components/TreeView
 */

import { UIElement, UIEventType, UIEvent } from '../UIElement';
import { Color } from '../../math/Color';
import { Vector2 } from '../../math/Vector2';

/**
 * Tree node data structure
 */
export interface TreeNode<T = any> {
  id: string;
  label: string;
  data?: T;
  children?: TreeNode<T>[];
  expanded?: boolean;
  selected?: boolean;
  lazy?: boolean;
  icon?: string;
}

/**
 * Lazy load callback type
 */
export type LazyLoadCallback<T> = (node: TreeNode<T>) => Promise<TreeNode<T>[]>;

/**
 * Hierarchical tree view with expand/collapse and lazy loading support.
 * Efficiently handles large tree structures with virtualization.
 *
 * @example
 * ```typescript
 * const tree = new TreeView<any>([
 *   {
 *     id: 'root',
 *     label: 'Root',
 *     children: [
 *       { id: 'child1', label: 'Child 1' },
 *       { id: 'child2', label: 'Child 2', children: [] }
 *     ]
 *   }
 * ]);
 *
 * tree.setSize(300, 400);
 * tree.onNodeSelected((node) => {
 *   console.log('Selected:', node.label);
 * });
 * ```
 */
export class TreeView<T = any> extends UIElement {
  /**
   * Root nodes
   */
  protected _nodes: TreeNode<T>[];

  /**
   * Flattened visible nodes (for rendering)
   */
  protected _flattenedNodes: { node: TreeNode<T>; depth: number }[] = [];

  /**
   * Tree width
   */
  public treeWidth: number;

  /**
   * Tree height
   */
  public treeHeight: number;

  /**
   * Node height
   */
  public nodeHeight: number;

  /**
   * Indent per level
   */
  public indentSize: number;

  /**
   * Background color
   */
  public override backgroundColor: Color;

  /**
   * Selected node color
   */
  public selectedColor: Color;

  /**
   * Hover node color
   */
  public hoverColor: Color;

  /**
   * Text color
   */
  public textColor: Color;

  /**
   * Expand/collapse icon size
   */
  public iconSize: number;

  /**
   * Scroll offset
   */
  protected _scrollY: number;

  /**
   * Hovered node index (in flattened list)
   */
  protected _hoveredIndex: number;

  /**
   * Selected node
   */
  protected _selectedNode: TreeNode<T> | null = null;

  /**
   * Node selected callback
   */
  protected _nodeSelectedCallback: ((node: TreeNode<T>) => void) | null = null;

  /**
   * Node expanded callback
   */
  protected _nodeExpandedCallback: ((node: TreeNode<T>, expanded: boolean) => void) | null = null;

  /**
   * Lazy load callback
   */
  protected _lazyLoadCallback: LazyLoadCallback<T> | null = null;

  /**
   * Creates a new tree view.
   *
   * @param nodes - Root nodes
   *
   * @example
   * ```typescript
   * const fileTree = new TreeView([
   *   {
   *     id: 'src',
   *     label: 'src',
   *     children: [
   *       { id: 'main.ts', label: 'main.ts' },
   *       { id: 'utils.ts', label: 'utils.ts' }
   *     ]
   *   }
   * ]);
   * ```
   */
  constructor(nodes: TreeNode<T>[] = []) {
    super('TreeView');

    this._nodes = nodes;
    this.treeWidth = 300;
    this.treeHeight = 400;
    this.nodeHeight = 28;
    this.indentSize = 20;
    this.iconSize = 12;
    this._scrollY = 0;
    this._hoveredIndex = -1;

    // Default colors
    this.backgroundColor = Color.white();
    this.selectedColor = Color.fromHex(0xE3F2FD);
    this.hoverColor = Color.fromHex(0xF5F5F5);
    this.textColor = Color.fromHex(0x212121);

    this.size.set(this.treeWidth, this.treeHeight);
    this.interactive = true;
    this.blockPointer = true;

    // Setup event listeners
    this.addEventListener(UIEventType.Click, this.handleClick.bind(this));
    this.addEventListener(UIEventType.PointerMove, this.handlePointerMove.bind(this));
    this.addEventListener(UIEventType.PointerLeave, this.handlePointerLeave.bind(this));

    // Initial flatten
    this.flattenNodes();
  }

  /**
   * Gets the root nodes.
   */
  get nodes(): readonly TreeNode<T>[] {
    return this._nodes;
  }

  /**
   * Gets the selected node.
   */
  get selectedNode(): TreeNode<T> | null {
    return this._selectedNode;
  }

  /**
   * Sets the tree nodes.
   */
  setNodes(nodes: TreeNode<T>[]): this {
    this._nodes = nodes;
    this._selectedNode = null;
    this._hoveredIndex = -1;
    this.flattenNodes();
    return this;
  }

  /**
   * Adds a root node.
   */
  addNode(node: TreeNode<T>): this {
    this._nodes.push(node);
    this.flattenNodes();
    return this;
  }

  /**
   * Finds a node by ID.
   */
  findNode(id: string, nodes: TreeNode<T>[] = this._nodes): TreeNode<T> | null {
    for (const node of nodes) {
      if (node.id === id) {
        return node;
      }
      if (node.children) {
        const found = this.findNode(id, node.children);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  /**
   * Expands a node.
   */
  expandNode(node: TreeNode<T>): this {
    if (node.expanded) {
      return this;
    }

    node.expanded = true;

    // Lazy load children if needed
    if (node.lazy && this._lazyLoadCallback && (!node.children || node.children.length === 0)) {
      this._lazyLoadCallback(node).then(children => {
        node.children = children;
        node.lazy = false;
        this.flattenNodes();
      });
    } else {
      this.flattenNodes();
    }

    if (this._nodeExpandedCallback) {
      this._nodeExpandedCallback(node, true);
    }

    return this;
  }

  /**
   * Collapses a node.
   */
  collapseNode(node: TreeNode<T>): this {
    if (!node.expanded) {
      return this;
    }

    node.expanded = false;
    this.flattenNodes();

    if (this._nodeExpandedCallback) {
      this._nodeExpandedCallback(node, false);
    }

    return this;
  }

  /**
   * Toggles node expansion.
   */
  toggleNode(node: TreeNode<T>): this {
    if (node.expanded) {
      this.collapseNode(node);
    } else {
      this.expandNode(node);
    }
    return this;
  }

  /**
   * Selects a node.
   */
  selectNode(node: TreeNode<T> | null): this {
    if (this._selectedNode) {
      this._selectedNode.selected = false;
    }

    this._selectedNode = node;

    if (node) {
      node.selected = true;

      if (this._nodeSelectedCallback) {
        this._nodeSelectedCallback(node);
      }
    }

    return this;
  }

  /**
   * Flattens the tree structure into a linear list of visible nodes.
   */
  protected flattenNodes(): void {
    this._flattenedNodes = [];
    this.flattenNodesRecursive(this._nodes, 0);
  }

  /**
   * Recursively flattens nodes.
   */
  protected flattenNodesRecursive(nodes: TreeNode<T>[], depth: number): void {
    for (const node of nodes) {
      this._flattenedNodes.push({ node, depth });

      if (node.expanded && node.children && node.children.length > 0) {
        this.flattenNodesRecursive(node.children, depth + 1);
      }
    }
  }

  /**
   * Gets the node at a specific Y position.
   */
  protected getNodeAtY(y: number): { node: TreeNode<T>; depth: number; index: number } | null {
    const scrolledY = y + this._scrollY;
    const index = Math.floor(scrolledY / this.nodeHeight);

    if (index >= 0 && index < this._flattenedNodes.length) {
      return { ...this._flattenedNodes[index], index };
    }

    return null;
  }

  /**
   * Sets the node selected callback.
   */
  onNodeSelected(callback: (node: TreeNode<T>) => void): this {
    this._nodeSelectedCallback = callback;
    return this;
  }

  /**
   * Sets the node expanded callback.
   */
  onNodeExpanded(callback: (node: TreeNode<T>, expanded: boolean) => void): this {
    this._nodeExpandedCallback = callback;
    return this;
  }

  /**
   * Sets the lazy load callback.
   */
  onLazyLoad(callback: LazyLoadCallback<T>): this {
    this._lazyLoadCallback = callback;
    return this;
  }

  /**
   * Handles click event.
   */
  protected handleClick(event: UIEvent): void {
    const localPos = this.worldToLocal(event.position);
    const nodeInfo = this.getNodeAtY(localPos.y);

    if (nodeInfo) {
      const { node, depth } = nodeInfo;
      const iconX = depth * this.indentSize;

      // Check if clicked on expand/collapse icon
      if (localPos.x >= iconX && localPos.x <= iconX + this.iconSize) {
        if (node.children && node.children.length > 0 || node.lazy) {
          this.toggleNode(node);
        }
      } else {
        // Clicked on node label
        this.selectNode(node);
      }
    }
  }

  /**
   * Handles pointer move event.
   */
  protected handlePointerMove(event: UIEvent): void {
    const localPos = this.worldToLocal(event.position);
    const nodeInfo = this.getNodeAtY(localPos.y);

    if (nodeInfo) {
      this._hoveredIndex = nodeInfo.index;
    } else {
      this._hoveredIndex = -1;
    }
  }

  /**
   * Handles pointer leave event.
   */
  protected handlePointerLeave(event: UIEvent): void {
    this._hoveredIndex = -1;
  }

  /**
   * Renders the tree view.
   */
  override render(context: CanvasRenderingContext2D): void {
    if (!this.visible || this.worldAlpha <= 0) {
      return;
    }

    const pos = this.worldPosition;
    const alpha = this.worldAlpha;

    context.save();
    context.globalAlpha = alpha;

    const x = pos.x - this.treeWidth * this.pivot.x;
    const y = pos.y - this.treeHeight * this.pivot.y;

    // Draw background
    context.fillStyle = this.backgroundColor.toCSSString();
    context.fillRect(x, y, this.treeWidth, this.treeHeight);

    // Setup clipping
    context.save();
    context.beginPath();
    context.rect(x, y, this.treeWidth, this.treeHeight);
    context.clip();

    // Render nodes
    const startIndex = Math.floor(this._scrollY / this.nodeHeight);
    const endIndex = Math.min(
      this._flattenedNodes.length,
      Math.ceil((this._scrollY + this.treeHeight) / this.nodeHeight)
    );

    for (let i = startIndex; i < endIndex; i++) {
      const { node, depth } = this._flattenedNodes[i];
      const nodeY = y + i * this.nodeHeight - this._scrollY;
      const isSelected = node === this._selectedNode;
      const isHovered = i === this._hoveredIndex;

      // Draw background
      if (isSelected) {
        context.fillStyle = this.selectedColor.toCSSString();
        context.fillRect(x, nodeY, this.treeWidth, this.nodeHeight);
      } else if (isHovered) {
        context.fillStyle = this.hoverColor.toCSSString();
        context.fillRect(x, nodeY, this.treeWidth, this.nodeHeight);
      }

      const indent = x + depth * this.indentSize;

      // Draw expand/collapse icon
      if (node.children && node.children.length > 0 || node.lazy) {
        context.fillStyle = this.textColor.toCSSString();
        context.beginPath();

        const iconCenterX = indent + this.iconSize / 2;
        const iconCenterY = nodeY + this.nodeHeight / 2;
        const iconHalfSize = this.iconSize / 3;

        if (node.expanded) {
          // Down arrow
          context.moveTo(iconCenterX - iconHalfSize, iconCenterY - iconHalfSize / 2);
          context.lineTo(iconCenterX, iconCenterY + iconHalfSize / 2);
          context.lineTo(iconCenterX + iconHalfSize, iconCenterY - iconHalfSize / 2);
        } else {
          // Right arrow
          context.moveTo(iconCenterX - iconHalfSize / 2, iconCenterY - iconHalfSize);
          context.lineTo(iconCenterX + iconHalfSize / 2, iconCenterY);
          context.lineTo(iconCenterX - iconHalfSize / 2, iconCenterY + iconHalfSize);
        }

        context.fill();
      }

      // Draw node label
      context.fillStyle = this.textColor.toCSSString();
      context.font = '14px sans-serif';
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.fillText(
        node.label,
        indent + this.iconSize + 4,
        nodeY + this.nodeHeight / 2
      );
    }

    context.restore();

    // Draw scrollbar if needed
    const totalHeight = this._flattenedNodes.length * this.nodeHeight;
    if (totalHeight > this.treeHeight) {
      const scrollbarHeight = (this.treeHeight / totalHeight) * this.treeHeight;
      const scrollbarY = (this._scrollY / (totalHeight - this.treeHeight)) * (this.treeHeight - scrollbarHeight);

      context.fillStyle = 'rgba(0, 0, 0, 0.3)';
      context.fillRect(x + this.treeWidth - 6, y + scrollbarY, 4, scrollbarHeight);
    }

    context.restore();
  }

  /**
   * Sets the tree view size.
   */
  setSize(width: number, height: number): this {
    this.treeWidth = width;
    this.treeHeight = height;
    this.size.set(width, height);
    return this;
  }
}
