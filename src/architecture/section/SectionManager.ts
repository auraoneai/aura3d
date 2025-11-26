/**
 * SectionManager.ts
 * Manages multiple section planes and section state
 * Part of G3D 5.0 Architecture/BIM Module
 */

import { Vector3 } from '../../math';
import { SectionPlane } from './SectionPlane';
import { SectionPlaneHelper } from './SectionPlaneHelper';
import { ISectionKeyframe } from './SectionTypes';
import { SECTION_PERFORMANCE } from './SectionConfig';

/**
 * Section animation state
 */
interface SectionAnimation {
  name: string;
  keyframes: ISectionKeyframe[];
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  loop: boolean;
}

/**
 * Manager for multiple section planes
 * Handles section plane organization, animation, and batch operations
 *
 * @example
 * ```typescript
 * const manager = new SectionManager();
 *
 * // Add named sections
 * manager.addSection('floor-plan', new SectionPlane({
 *   normal: new Vector3(0, 0, 1),
 *   distance: 10
 * }));
 *
 * // Enable specific section
 * manager.enable('floor-plan');
 *
 * // Create section group
 * manager.createGroup('building-sections', ['floor-plan', 'elevation']);
 * ```
 */
export class SectionManager {
  private sections: Map<string, SectionPlane>;
  private helpers: Map<string, SectionPlaneHelper>;
  private groups: Map<string, Set<string>>;
  private animations: Map<string, SectionAnimation>;
  private maxPlanes: number;
  private onChange?: () => void;

  /**
   * Create a new section manager
   * @param options - Manager options
   */
  constructor(options: {
    maxPlanes?: number;
    onChange?: () => void;
  } = {}) {
    this.sections = new Map();
    this.helpers = new Map();
    this.groups = new Map();
    this.animations = new Map();
    this.maxPlanes = options.maxPlanes ?? SECTION_PERFORMANCE.maxClippingPlanes;
    this.onChange = options.onChange;
  }

  /**
   * Add a section plane
   * @param name - Section name
   * @param plane - Section plane
   * @returns True if added successfully
   */
  public addSection(name: string, plane: SectionPlane): boolean {
    if (this.sections.size >= this.maxPlanes) {
      console.warn(`Maximum number of section planes (${this.maxPlanes}) reached`);
      return false;
    }

    this.sections.set(name, plane);
    this.notifyChange();
    return true;
  }

  /**
   * Remove a section plane
   * @param name - Section name
   * @returns True if removed successfully
   */
  public removeSection(name: string): boolean {
    const removed = this.sections.delete(name);

    if (removed) {
      // Remove from all groups
      for (const group of this.groups.values()) {
        group.delete(name);
      }

      // Dispose helper if exists
      const helper = this.helpers.get(name);
      if (helper) {
        helper.dispose();
        this.helpers.delete(name);
      }

      this.notifyChange();
    }

    return removed;
  }

  /**
   * Get a section plane by name
   * @param name - Section name
   * @returns Section plane or undefined
   */
  public getSection(name: string): SectionPlane | undefined {
    return this.sections.get(name);
  }

  /**
   * Check if section exists
   * @param name - Section name
   * @returns True if section exists
   */
  public hasSection(name: string): boolean {
    return this.sections.has(name);
  }

  /**
   * Get all section names
   * @returns Array of section names
   */
  public getSectionNames(): string[] {
    return Array.from(this.sections.keys());
  }

  /**
   * Get all sections
   * @returns Array of section planes
   */
  public getAllSections(): SectionPlane[] {
    return Array.from(this.sections.values());
  }

  /**
   * Get all enabled sections
   * @returns Array of enabled section planes
   */
  public getEnabledSections(): SectionPlane[] {
    return this.getAllSections().filter(plane => plane.enabled);
  }

  /**
   * Enable a section plane
   * @param name - Section name
   */
  public enable(name: string): void {
    const section = this.sections.get(name);
    if (section) {
      section.enabled = true;
      this.notifyChange();
    }
  }

  /**
   * Disable a section plane
   * @param name - Section name
   */
  public disable(name: string): void {
    const section = this.sections.get(name);
    if (section) {
      section.enabled = false;
      this.notifyChange();
    }
  }

  /**
   * Toggle a section plane
   * @param name - Section name
   */
  public toggle(name: string): void {
    const section = this.sections.get(name);
    if (section) {
      section.enabled = !section.enabled;
      this.notifyChange();
    }
  }

  /**
   * Enable all section planes
   */
  public enableAll(): void {
    for (const section of this.sections.values()) {
      section.enabled = true;
    }
    this.notifyChange();
  }

  /**
   * Disable all section planes
   */
  public disableAll(): void {
    for (const section of this.sections.values()) {
      section.enabled = false;
    }
    this.notifyChange();
  }

  /**
   * Clear all section planes
   */
  public clear(): void {
    // Dispose all helpers
    for (const helper of this.helpers.values()) {
      helper.dispose();
    }

    this.sections.clear();
    this.helpers.clear();
    this.groups.clear();
    this.animations.clear();
    this.notifyChange();
  }

  /**
   * Create a section group
   * @param groupName - Group name
   * @param sectionNames - Section names to include
   */
  public createGroup(groupName: string, sectionNames: string[]): void {
    const group = new Set<string>();

    for (const name of sectionNames) {
      if (this.sections.has(name)) {
        group.add(name);
      }
    }

    this.groups.set(groupName, group);
  }

  /**
   * Remove a section group
   * @param groupName - Group name
   */
  public removeGroup(groupName: string): void {
    this.groups.delete(groupName);
  }

  /**
   * Add section to group
   * @param groupName - Group name
   * @param sectionName - Section name
   */
  public addToGroup(groupName: string, sectionName: string): void {
    if (!this.sections.has(sectionName)) return;

    let group = this.groups.get(groupName);
    if (!group) {
      group = new Set();
      this.groups.set(groupName, group);
    }

    group.add(sectionName);
  }

  /**
   * Remove section from group
   * @param groupName - Group name
   * @param sectionName - Section name
   */
  public removeFromGroup(groupName: string, sectionName: string): void {
    const group = this.groups.get(groupName);
    if (group) {
      group.delete(sectionName);
    }
  }

  /**
   * Get sections in group
   * @param groupName - Group name
   * @returns Array of section planes
   */
  public getGroupSections(groupName: string): SectionPlane[] {
    const group = this.groups.get(groupName);
    if (!group) return [];

    return Array.from(group)
      .map(name => this.sections.get(name))
      .filter((section): section is SectionPlane => section !== undefined);
  }

  /**
   * Enable group
   * @param groupName - Group name
   */
  public enableGroup(groupName: string): void {
    const sections = this.getGroupSections(groupName);
    for (const section of sections) {
      section.enabled = true;
    }
    this.notifyChange();
  }

  /**
   * Disable group
   * @param groupName - Group name
   */
  public disableGroup(groupName: string): void {
    const sections = this.getGroupSections(groupName);
    for (const section of sections) {
      section.enabled = false;
    }
    this.notifyChange();
  }

  /**
   * Create or update visual helper for section
   * @param name - Section name
   * @param options - Helper options
   * @returns Section plane helper or undefined
   */
  public createHelper(name: string, options?: any): SectionPlaneHelper | undefined {
    const section = this.sections.get(name);
    if (!section) return undefined;

    // Dispose existing helper
    const existingHelper = this.helpers.get(name);
    if (existingHelper) {
      existingHelper.dispose();
    }

    const helper = new SectionPlaneHelper(section, options);
    this.helpers.set(name, helper);
    return helper;
  }

  /**
   * Get helper for section
   * @param name - Section name
   * @returns Section plane helper or undefined
   */
  public getHelper(name: string): SectionPlaneHelper | undefined {
    return this.helpers.get(name);
  }

  /**
   * Create section animation
   * @param name - Animation name
   * @param sectionName - Section to animate
   * @param keyframes - Animation keyframes
   * @param duration - Total duration in seconds
   * @param loop - Loop animation
   */
  public createAnimation(
    name: string,
    sectionName: string,
    keyframes: ISectionKeyframe[],
    duration: number,
    loop: boolean = false
  ): void {
    if (!this.sections.has(sectionName)) return;

    // Sort keyframes by time
    const sortedKeyframes = [...keyframes].sort((a, b) => a.time - b.time);

    this.animations.set(name, {
      name: sectionName,
      keyframes: sortedKeyframes,
      duration,
      currentTime: 0,
      isPlaying: false,
      loop
    });
  }

  /**
   * Play animation
   * @param name - Animation name
   */
  public playAnimation(name: string): void {
    const animation = this.animations.get(name);
    if (animation) {
      animation.isPlaying = true;
      animation.currentTime = 0;
    }
  }

  /**
   * Pause animation
   * @param name - Animation name
   */
  public pauseAnimation(name: string): void {
    const animation = this.animations.get(name);
    if (animation) {
      animation.isPlaying = false;
    }
  }

  /**
   * Stop animation
   * @param name - Animation name
   */
  public stopAnimation(name: string): void {
    const animation = this.animations.get(name);
    if (animation) {
      animation.isPlaying = false;
      animation.currentTime = 0;
    }
  }

  /**
   * Update animations
   * @param deltaTime - Time delta in seconds
   */
  public updateAnimations(deltaTime: number): void {
    for (const animation of this.animations.values()) {
      if (!animation.isPlaying) continue;

      animation.currentTime += deltaTime;

      if (animation.currentTime >= animation.duration) {
        if (animation.loop) {
          animation.currentTime = animation.currentTime % animation.duration;
        } else {
          animation.currentTime = animation.duration;
          animation.isPlaying = false;
        }
      }

      this.applyAnimation(animation);
    }
  }

  /**
   * Apply animation at current time
   * @param animation - Animation to apply
   */
  private applyAnimation(animation: SectionAnimation): void {
    const section = this.sections.get(animation.name);
    if (!section) return;

    const { keyframes, currentTime } = animation;

    // Find surrounding keyframes
    let prevKeyframe = keyframes[0];
    let nextKeyframe = keyframes[keyframes.length - 1];

    for (let i = 0; i < keyframes.length - 1; i++) {
      if (keyframes[i].time <= currentTime && keyframes[i + 1].time >= currentTime) {
        prevKeyframe = keyframes[i];
        nextKeyframe = keyframes[i + 1];
        break;
      }
    }

    // Interpolate
    const timeDiff = nextKeyframe.time - prevKeyframe.time;
    const t = timeDiff > 0 ? (currentTime - prevKeyframe.time) / timeDiff : 0;

    const normal = prevKeyframe.normal.clone().lerp(nextKeyframe.normal, t).normalize();
    const distance = prevKeyframe.distance + (nextKeyframe.distance - prevKeyframe.distance) * t;

    section.normal = normal;
    section.distance = distance;

    // Update helper if exists
    const helper = this.helpers.get(animation.name);
    if (helper) {
      helper.updateTransform();
    }

    this.notifyChange();
  }

  /**
   * Get section plane count
   * @returns Number of sections
   */
  public getCount(): number {
    return this.sections.size;
  }

  /**
   * Get enabled section count
   * @returns Number of enabled sections
   */
  public getEnabledCount(): number {
    return this.getEnabledSections().length;
  }

  /**
   * Notify change listeners
   */
  private notifyChange(): void {
    if (this.onChange) {
      this.onChange();
    }
  }

  /**
   * Set change callback
   * @param callback - Callback function
   */
  public setOnChange(callback: () => void): void {
    this.onChange = callback;
  }

  /**
   * Dispose manager resources
   */
  public dispose(): void {
    for (const helper of this.helpers.values()) {
      helper.dispose();
    }

    this.sections.clear();
    this.helpers.clear();
    this.groups.clear();
    this.animations.clear();
  }
}
