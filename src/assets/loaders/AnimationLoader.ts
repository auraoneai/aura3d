import { Asset } from '../Asset';
import { IAssetLoader, LoadOptions } from '../AssetLoader';
import { Logger } from '../../core/Logger';

const logger = Logger.create('AnimationLoader');

/**
 * Animation interpolation type
 */
export enum AnimationInterpolation {
  LINEAR = 'linear',
  STEP = 'step',
  CUBIC_SPLINE = 'cubicspline'
}

/**
 * Animation target path
 */
export enum AnimationPath {
  TRANSLATION = 'translation',
  ROTATION = 'rotation',
  SCALE = 'scale',
  WEIGHTS = 'weights'
}

/**
 * Animation keyframe
 */
export interface AnimationKeyframe {
  /** Time in seconds */
  time: number;
  /** Value at this keyframe */
  value: number | number[];
  /** Input tangent for cubic spline */
  inTangent?: number | number[];
  /** Output tangent for cubic spline */
  outTangent?: number | number[];
}

/**
 * Animation channel
 */
export interface AnimationChannel {
  /** Target node/object name or ID */
  target: string;
  /** Target property path */
  path: AnimationPath;
  /** Keyframes */
  keyframes: AnimationKeyframe[];
  /** Interpolation type */
  interpolation: AnimationInterpolation;
}

/**
 * Animation clip metadata
 */
export interface AnimationMetadata {
  /** Animation name */
  name: string;
  /** Duration in seconds */
  duration: number;
  /** Number of channels */
  channelCount: number;
  /** Frame rate if applicable */
  frameRate?: number;
  /** Whether animation loops */
  loop?: boolean;
}

/**
 * Animation clip asset
 */
export class AnimationAsset extends Asset {
  private channels: AnimationChannel[] = [];
  private animationMetadata: AnimationMetadata | null = null;

  /**
   * Gets the animation channels
   */
  get data(): AnimationChannel[] {
    return this.channels;
  }

  /**
   * Gets the animation metadata
   */
  override get metadata(): AnimationMetadata | null {
    return this.animationMetadata;
  }

  /**
   * Sets the animation data
   */
  setData(channels: AnimationChannel[], metadata: AnimationMetadata): void {
    this.channels = channels;
    this.animationMetadata = metadata;
  }

  /**
   * Gets a channel by target and path
   */
  getChannel(target: string, path: AnimationPath): AnimationChannel | undefined {
    return this.channels.find(c => c.target === target && c.path === path);
  }

  /**
   * Gets all channels for a target
   */
  getChannelsForTarget(target: string): AnimationChannel[] {
    return this.channels.filter(c => c.target === target);
  }

  /**
   * Gets the estimated memory size in bytes
   */
  getMemorySize(): number {
    let size = 0;

    for (const channel of this.channels) {
      for (const keyframe of channel.keyframes) {
        size += 8;
        if (Array.isArray(keyframe.value)) {
          size += keyframe.value.length * 8;
        } else {
          size += 8;
        }
        if (keyframe.inTangent) {
          size += Array.isArray(keyframe.inTangent) ? keyframe.inTangent.length * 8 : 8;
        }
        if (keyframe.outTangent) {
          size += Array.isArray(keyframe.outTangent) ? keyframe.outTangent.length * 8 : 8;
        }
      }
    }

    return size;
  }

  /**
   * Disposes the animation and frees resources
   */
  override dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.channels = [];
    this.animationMetadata = null;

    super.dispose();
  }
}

/**
 * Animation loader supporting JSON-based animation clips
 */
export class AnimationLoader implements IAssetLoader<AnimationAsset> {
  private static readonly SUPPORTED_EXTENSIONS = ['anim', 'json'];

  /**
   * Loads an animation from a URL
   */
  async load(url: string, options?: LoadOptions): Promise<AnimationAsset> {
    logger.debug(`Loading animation: ${url}`);

    try {
      const response = await fetch(url, { signal: options?.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      const asset = new AnimationAsset({ name: url });

      const channels = this.parseChannels(json.channels || []);
      const duration = this.calculateDuration(channels);

      const metadata: AnimationMetadata = {
        name: json.name || url,
        duration,
        channelCount: channels.length,
        frameRate: json.frameRate,
        loop: json.loop !== false
      };

      asset.setData(channels, metadata);

      logger.info(`Animation loaded successfully: ${url} (${duration.toFixed(2)}s, ${channels.length} channels)`);
      return asset;
    } catch (error) {
      logger.error(`Failed to load animation: ${url}`, error);
      throw error;
    }
  }

  /**
   * Checks if this loader can handle the given URL
   */
  canLoad(url: string): boolean {
    const ext = this.getExtension(url);
    return ext !== null && AnimationLoader.SUPPORTED_EXTENSIONS.includes(ext);
  }

  /**
   * Gets supported file extensions
   */
  getSupportedExtensions(): string[] {
    return [...AnimationLoader.SUPPORTED_EXTENSIONS];
  }

  /**
   * Parses animation channels from JSON
   */
  private parseChannels(channelsData: any[]): AnimationChannel[] {
    const channels: AnimationChannel[] = [];

    for (const channelData of channelsData) {
      const keyframes: AnimationKeyframe[] = [];

      for (const kfData of channelData.keyframes || []) {
        const keyframe: AnimationKeyframe = {
          time: kfData.time || 0,
          value: kfData.value
        };

        if (kfData.inTangent !== undefined) {
          keyframe.inTangent = kfData.inTangent;
        }
        if (kfData.outTangent !== undefined) {
          keyframe.outTangent = kfData.outTangent;
        }

        keyframes.push(keyframe);
      }

      keyframes.sort((a, b) => a.time - b.time);

      const channel: AnimationChannel = {
        target: channelData.target || '',
        path: this.parseAnimationPath(channelData.path),
        keyframes,
        interpolation: this.parseInterpolation(channelData.interpolation)
      };

      channels.push(channel);
    }

    return channels;
  }

  /**
   * Parses animation path from string
   */
  private parseAnimationPath(path: string): AnimationPath {
    switch (path?.toLowerCase()) {
      case 'translation':
      case 'position':
        return AnimationPath.TRANSLATION;
      case 'rotation':
        return AnimationPath.ROTATION;
      case 'scale':
        return AnimationPath.SCALE;
      case 'weights':
        return AnimationPath.WEIGHTS;
      default:
        return AnimationPath.TRANSLATION;
    }
  }

  /**
   * Parses interpolation type from string
   */
  private parseInterpolation(interpolation: string): AnimationInterpolation {
    switch (interpolation?.toLowerCase()) {
      case 'step':
        return AnimationInterpolation.STEP;
      case 'cubicspline':
      case 'cubic':
        return AnimationInterpolation.CUBIC_SPLINE;
      default:
        return AnimationInterpolation.LINEAR;
    }
  }

  /**
   * Calculates total animation duration
   */
  private calculateDuration(channels: AnimationChannel[]): number {
    let maxDuration = 0;

    for (const channel of channels) {
      if (channel.keyframes.length > 0) {
        const lastKeyframe = channel.keyframes[channel.keyframes.length - 1];
        maxDuration = Math.max(maxDuration, lastKeyframe.time);
      }
    }

    return maxDuration;
  }

  /**
   * Extracts file extension from URL
   */
  private getExtension(url: string): string | null {
    const match = url.match(/\.([^./?#]+)(?:[?#]|$)/i);
    return match ? match[1].toLowerCase() : null;
  }
}
