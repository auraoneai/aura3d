import { Asset, AssetMetadata } from '../Asset';
import { IAssetLoader, LoadOptions } from '../AssetLoader';
import { Logger } from '../../core/Logger';

const logger = Logger.create('SceneLoader');

/**
 * Scene node transform
 */
export interface SceneNodeTransform {
  /** Translation [x, y, z] */
  translation?: number[];
  /** Rotation quaternion [x, y, z, w] */
  rotation?: number[];
  /** Scale [x, y, z] */
  scale?: number[];
  /** 4x4 transformation matrix (column-major) */
  matrix?: number[];
}

/**
 * Scene node
 */
export interface SceneNode {
  /** Node name */
  name: string;
  /** Transform */
  transform?: SceneNodeTransform;
  /** Mesh asset URI */
  mesh?: string;
  /** Material asset URI */
  material?: string;
  /** Camera name */
  camera?: string;
  /** Light name */
  light?: string;
  /** Child node indices */
  children?: number[];
  /** Custom properties */
  extras?: Record<string, any>;
}

/**
 * Scene camera
 */
export interface SceneCamera {
  /** Camera name */
  name: string;
  /** Camera type */
  type: 'perspective' | 'orthographic';
  /** Perspective parameters */
  perspective?: {
    aspectRatio?: number;
    yfov: number;
    zfar?: number;
    znear: number;
  };
  /** Orthographic parameters */
  orthographic?: {
    xmag: number;
    ymag: number;
    zfar: number;
    znear: number;
  };
}

/**
 * Scene light
 */
export interface SceneLight {
  /** Light name */
  name: string;
  /** Light type */
  type: 'directional' | 'point' | 'spot';
  /** Light color [R, G, B] */
  color?: number[];
  /** Light intensity */
  intensity?: number;
  /** Range for point/spot lights */
  range?: number;
  /** Spot light parameters */
  spot?: {
    innerConeAngle: number;
    outerConeAngle: number;
  };
}

/**
 * Scene definition
 */
export interface SceneDefinition {
  /** Scene name */
  name: string;
  /** Scene nodes */
  nodes: SceneNode[];
  /** Root node indices */
  rootNodes: number[];
  /** Cameras */
  cameras?: SceneCamera[];
  /** Lights */
  lights?: SceneLight[];
  /** Environment map URI */
  environment?: string;
  /** Background color [R, G, B, A] */
  backgroundColor?: number[];
  /** Custom properties */
  extras?: Record<string, any>;
}

/**
 * Scene metadata
 */
export interface SceneMetadata extends AssetMetadata {
  /** Scene name */
  name: string;
  /** Number of nodes */
  nodeCount: number;
  /** Number of meshes */
  meshCount: number;
  /** Number of cameras */
  cameraCount: number;
  /** Number of lights */
  lightCount: number;
  /** Referenced asset URIs */
  assetUris: string[];
}

/**
 * Scene asset
 */
export class SceneAsset extends Asset {
  private definition: SceneDefinition | null = null;
  private sceneMetadata: SceneMetadata | null = null;

  /**
   * Gets the scene definition
   */
  get data(): SceneDefinition | null {
    return this.definition;
  }

  /**
   * Gets the scene metadata
   */
  override get metadata(): Readonly<AssetMetadata> {
    return this.sceneMetadata || {};
  }

  /**
   * Sets the scene data
   */
  setData(definition: SceneDefinition, metadata: SceneMetadata): void {
    this.definition = definition;
    this.sceneMetadata = metadata;
  }

  /**
   * Gets a node by name
   */
  getNodeByName(name: string): SceneNode | undefined {
    return this.definition?.nodes.find(n => n.name === name);
  }

  /**
   * Gets root nodes
   */
  getRootNodes(): SceneNode[] {
    if (!this.definition) {
      return [];
    }

    return this.definition.rootNodes.map(i => this.definition!.nodes[i]);
  }

  /**
   * Gets the estimated memory size in bytes
   */
  getMemorySize(): number {
    return JSON.stringify(this.definition).length * 2;
  }

  /**
   * Disposes the scene and frees resources
   */
  override dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.definition = null;
    this.sceneMetadata = null;

    super.dispose();
  }
}

/**
 * Scene loader supporting JSON scene definitions
 */
export class SceneLoader implements IAssetLoader<SceneAsset> {
  private static readonly SUPPORTED_EXTENSIONS = ['scene', 'json'];

  /**
   * Loads a scene from a URL
   */
  async load(url: string, options?: LoadOptions): Promise<SceneAsset> {
    logger.debug(`Loading scene: ${url}`);

    try {
      const response = await fetch(url, { signal: options?.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      const asset = new SceneAsset({ name: url });

      const definition = this.parseSceneDefinition(json);
      const metadata = this.extractMetadata(definition);

      asset.setData(definition, metadata);

      logger.info(`Scene loaded successfully: ${url} (${metadata.nodeCount} nodes)`);
      return asset;
    } catch (error) {
      logger.error(`Failed to load scene: ${url}`, error);
      throw error;
    }
  }

  /**
   * Checks if this loader can handle the given URL
   */
  canLoad(url: string): boolean {
    const ext = this.getExtension(url);
    return ext !== null && SceneLoader.SUPPORTED_EXTENSIONS.includes(ext);
  }

  /**
   * Gets supported file extensions
   */
  getSupportedExtensions(): string[] {
    return [...SceneLoader.SUPPORTED_EXTENSIONS];
  }

  /**
   * Parses scene definition from JSON
   */
  private parseSceneDefinition(json: any): SceneDefinition {
    const nodes: SceneNode[] = [];

    if (json.nodes) {
      for (const nodeData of json.nodes) {
        nodes.push(this.parseNode(nodeData));
      }
    }

    const definition: SceneDefinition = {
      name: json.name || 'Untitled',
      nodes,
      rootNodes: json.rootNodes || json.scene || []
    };

    if (json.cameras) {
      definition.cameras = json.cameras.map((c: any) => this.parseCamera(c));
    }

    if (json.lights) {
      definition.lights = json.lights.map((l: any) => this.parseLight(l));
    }

    if (json.environment) {
      definition.environment = json.environment;
    }

    if (json.backgroundColor) {
      definition.backgroundColor = json.backgroundColor;
    }

    if (json.extras) {
      definition.extras = json.extras;
    }

    return definition;
  }

  /**
   * Parses a scene node
   */
  private parseNode(nodeData: any): SceneNode {
    const node: SceneNode = {
      name: nodeData.name || 'Node'
    };

    if (nodeData.translation || nodeData.rotation || nodeData.scale || nodeData.matrix) {
      node.transform = {};

      if (nodeData.translation) {
        node.transform.translation = nodeData.translation;
      }

      if (nodeData.rotation) {
        node.transform.rotation = nodeData.rotation;
      }

      if (nodeData.scale) {
        node.transform.scale = nodeData.scale;
      }

      if (nodeData.matrix) {
        node.transform.matrix = nodeData.matrix;
      }
    }

    if (nodeData.mesh !== undefined) {
      node.mesh = nodeData.mesh.toString();
    }

    if (nodeData.material !== undefined) {
      node.material = nodeData.material.toString();
    }

    if (nodeData.camera !== undefined) {
      node.camera = nodeData.camera.toString();
    }

    if (nodeData.light !== undefined) {
      node.light = nodeData.light.toString();
    }

    if (nodeData.children) {
      node.children = nodeData.children;
    }

    if (nodeData.extras) {
      node.extras = nodeData.extras;
    }

    return node;
  }

  /**
   * Parses a camera
   */
  private parseCamera(cameraData: any): SceneCamera {
    const camera: SceneCamera = {
      name: cameraData.name || 'Camera',
      type: cameraData.type || 'perspective'
    };

    if (cameraData.perspective) {
      camera.perspective = cameraData.perspective;
    }

    if (cameraData.orthographic) {
      camera.orthographic = cameraData.orthographic;
    }

    return camera;
  }

  /**
   * Parses a light
   */
  private parseLight(lightData: any): SceneLight {
    const light: SceneLight = {
      name: lightData.name || 'Light',
      type: lightData.type || 'directional',
      color: lightData.color || [1, 1, 1],
      intensity: lightData.intensity !== undefined ? lightData.intensity : 1
    };

    if (lightData.range !== undefined) {
      light.range = lightData.range;
    }

    if (lightData.spot) {
      light.spot = lightData.spot;
    }

    return light;
  }

  /**
   * Extracts metadata from scene definition
   */
  private extractMetadata(definition: SceneDefinition): SceneMetadata {
    const assetUris: string[] = [];
    let meshCount = 0;

    for (const node of definition.nodes) {
      if (node.mesh) {
        assetUris.push(node.mesh);
        meshCount++;
      }
      if (node.material) {
        assetUris.push(node.material);
      }
    }

    if (definition.environment) {
      assetUris.push(definition.environment);
    }

    return {
      name: definition.name,
      nodeCount: definition.nodes.length,
      meshCount,
      cameraCount: definition.cameras?.length || 0,
      lightCount: definition.lights?.length || 0,
      assetUris: Array.from(new Set(assetUris))
    };
  }

  /**
   * Extracts file extension from URL
   */
  private getExtension(url: string): string | null {
    const match = url.match(/\.([^./?#]+)(?:[?#]|$)/i);
    return match ? match[1].toLowerCase() : null;
  }
}
