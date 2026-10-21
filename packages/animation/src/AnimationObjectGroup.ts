import { PropertyBinding, type AnimationObjectGroupLike, type ParsedTrackName, type PropertyBindingLike, type PropertyBindingNode } from "./PropertyBinding.js";

/**
 * SA-02 — three-compatible `AnimationObjectGroup` (`three@0.185.x
 * src/animation/AnimationObjectGroup.js`). A group of objects that receives a
 * shared animation state: add the objects you would otherwise pass as the
 * mixer root, then pass this group instead. `PropertyBinding.create` detects
 * `isAnimationObjectGroup` and produces a composite binding that fans each
 * track path out over all active objects.
 *
 * Objects keep the cached/active bookkeeping of the original implementation:
 * `remove()` moves objects into a cached region (bindings preserved), `add()`
 * reactivates them, and `uncache()` frees them entirely. Objects without a
 * `uuid` get a stable generated one so plain `{ name }` nodes can join groups.
 */

let objectGroupUuidCounter = 0;
const generatedUuids = new WeakMap<object, string>();

function objectUuid(object: PropertyBindingNode): string {
  if (typeof object.uuid === "string" && object.uuid.length > 0) {
    return object.uuid;
  }
  let uuid = generatedUuids.get(object);
  if (!uuid) {
    uuid = `animation-object-group-${(objectGroupUuidCounter++).toString(16)}-${Math.random().toString(36).slice(2, 10)}`;
    generatedUuids.set(object, uuid);
  }
  return uuid;
}

export class AnimationObjectGroup implements AnimationObjectGroupLike {
  readonly isAnimationObjectGroup = true as const;
  readonly uuid: string;

  /** Threshold between cached and active objects; read by the composite binding. */
  nCachedObjects_ = 0;

  private readonly _objects: PropertyBindingNode[];
  private readonly _indicesByUUID: Record<string, number | undefined> = {};
  private readonly _paths: string[] = [];
  private readonly _parsedPaths: (ParsedTrackName | undefined)[] = [];
  private readonly _bindings: PropertyBindingLike[][] = [];
  private readonly _bindingsIndicesByPath: Record<string, number | undefined> = {};

  readonly stats: {
    readonly objects: { readonly total: number; readonly inUse: number };
    readonly bindingsPerObject: number;
  };

  constructor(...args: PropertyBindingNode[]) {
    this.uuid = `animation-object-group-${(objectGroupUuidCounter++).toString(16)}-${Math.random().toString(36).slice(2, 10)}`;
    this._objects = args.slice();
    for (let i = 0, n = args.length; i !== n; ++i) {
      this._indicesByUUID[objectUuid(args[i]!)] = i;
    }
    const scope = this;
    this.stats = {
      objects: {
        get total() {
          return scope._objects.length;
        },
        get inUse() {
          return scope._objects.length - scope.nCachedObjects_;
        }
      },
      get bindingsPerObject() {
        return scope._bindings.length;
      }
    };
  }

  add(...args: PropertyBindingNode[]): void {
    const objects = this._objects;
    const indicesByUUID = this._indicesByUUID;
    const paths = this._paths;
    const parsedPaths = this._parsedPaths;
    const bindings = this._bindings;
    const nBindings = bindings.length;

    let knownObject: PropertyBindingNode | undefined;
    let nObjects = objects.length;
    let nCachedObjects = this.nCachedObjects_;

    for (let i = 0, n = args.length; i !== n; ++i) {
      const object = args[i]!;
      const uuid = objectUuid(object);
      let index = indicesByUUID[uuid];

      if (index === undefined) {
        // unknown object -> add it to the ACTIVE region
        index = nObjects++;
        indicesByUUID[uuid] = index;
        objects.push(object);

        // accounting is done, now do the same for all bindings
        for (let j = 0, m = nBindings; j !== m; ++j) {
          bindings[j]!.push(new PropertyBinding(object, paths[j]!, parsedPaths[j]));
        }
      } else if (index < nCachedObjects) {
        knownObject = objects[index]!;
        // move existing object to the ACTIVE region
        const firstActiveIndex = --nCachedObjects;
        const lastCachedObject = objects[firstActiveIndex]!;

        indicesByUUID[objectUuid(lastCachedObject)] = index;
        objects[index] = lastCachedObject;

        indicesByUUID[uuid] = firstActiveIndex;
        objects[firstActiveIndex] = object;

        for (let j = 0, m = nBindings; j !== m; ++j) {
          const bindingsForPath = bindings[j]!;
          const lastCached = bindingsForPath[firstActiveIndex];
          let binding = bindingsForPath[index];
          bindingsForPath[index] = lastCached!;
          if (binding === undefined) {
            // since we do not bother to create new bindings for objects that
            // are cached, the binding may or may not exist
            binding = new PropertyBinding(object, paths[j]!, parsedPaths[j]);
          }
          bindingsForPath[firstActiveIndex] = binding;
        }
      } else if (objects[index] !== knownObject) {
        console.error(
          "AnimationObjectGroup: Different objects with the same UUID detected. " +
          "Clean the caches or recreate your infrastructure when reloading scenes."
        );
      } // else the object is already where we want it to be
    }

    this.nCachedObjects_ = nCachedObjects;
  }

  remove(...args: PropertyBindingNode[]): void {
    const objects = this._objects;
    const indicesByUUID = this._indicesByUUID;
    const bindings = this._bindings;
    const nBindings = bindings.length;

    let nCachedObjects = this.nCachedObjects_;

    for (let i = 0, n = args.length; i !== n; ++i) {
      const object = args[i]!;
      const uuid = objectUuid(object);
      const index = indicesByUUID[uuid];

      if (index !== undefined && index >= nCachedObjects) {
        // move existing object into the CACHED region
        const lastCachedIndex = nCachedObjects++;
        const firstActiveObject = objects[lastCachedIndex]!;

        indicesByUUID[objectUuid(firstActiveObject)] = index;
        objects[index] = firstActiveObject;

        indicesByUUID[uuid] = lastCachedIndex;
        objects[lastCachedIndex] = object;

        for (let j = 0, m = nBindings; j !== m; ++j) {
          const bindingsForPath = bindings[j]!;
          const firstActive = bindingsForPath[lastCachedIndex];
          const binding = bindingsForPath[index];
          bindingsForPath[index] = firstActive!;
          bindingsForPath[lastCachedIndex] = binding!;
        }
      }
    }

    this.nCachedObjects_ = nCachedObjects;
  }

  uncache(...args: PropertyBindingNode[]): void {
    const objects = this._objects;
    const indicesByUUID = this._indicesByUUID;
    const bindings = this._bindings;
    const nBindings = bindings.length;

    let nCachedObjects = this.nCachedObjects_;
    let nObjects = objects.length;

    for (let i = 0, n = args.length; i !== n; ++i) {
      const object = args[i]!;
      const uuid = objectUuid(object);
      const index = indicesByUUID[uuid];

      if (index !== undefined) {
        delete indicesByUUID[uuid];

        if (index < nCachedObjects) {
          // object is cached, shrink the CACHED region
          const firstActiveIndex = --nCachedObjects;
          const lastCachedObject = objects[firstActiveIndex]!;
          const lastIndex = --nObjects;
          const lastObject = objects[lastIndex]!;

          // last cached object takes this object's place
          indicesByUUID[objectUuid(lastCachedObject)] = index;
          objects[index] = lastCachedObject;

          // last object goes to the activated slot and pop
          indicesByUUID[objectUuid(lastObject)] = firstActiveIndex;
          objects[firstActiveIndex] = lastObject;
          objects.pop();

          for (let j = 0, m = nBindings; j !== m; ++j) {
            const bindingsForPath = bindings[j]!;
            const lastCached = bindingsForPath[firstActiveIndex];
            const last = bindingsForPath[lastIndex];
            bindingsForPath[index] = lastCached!;
            bindingsForPath[firstActiveIndex] = last!;
            bindingsForPath.pop();
          }
        } else {
          // object is active, just swap with the last and pop
          const lastIndex = --nObjects;
          const lastObject = objects[lastIndex]!;

          if (lastIndex > 0) {
            indicesByUUID[objectUuid(lastObject)] = index;
          }

          objects[index] = lastObject;
          objects.pop();

          for (let j = 0, m = nBindings; j !== m; ++j) {
            const bindingsForPath = bindings[j]!;
            bindingsForPath[index] = bindingsForPath[lastIndex]!;
            bindingsForPath.pop();
          }
        }
      }
    }

    this.nCachedObjects_ = nCachedObjects;
  }

  /** Internal interface used by `PropertyBindingComposite`. */
  subscribe_(path: string, parsedPath?: ParsedTrackName): PropertyBindingLike[] {
    const indicesByPath = this._bindingsIndicesByPath;
    let index = indicesByPath[path];
    const bindings = this._bindings;

    if (index !== undefined) {
      return bindings[index]!;
    }

    const paths = this._paths;
    const parsedPaths = this._parsedPaths;
    const objects = this._objects;
    const nObjects = objects.length;
    const nCachedObjects = this.nCachedObjects_;
    const bindingsForPath: PropertyBindingLike[] = new Array(nObjects);

    index = bindings.length;
    indicesByPath[path] = index;

    paths.push(path);
    parsedPaths.push(parsedPath);
    bindings.push(bindingsForPath);

    for (let i = nCachedObjects, n = objects.length; i !== n; ++i) {
      const object = objects[i]!;
      bindingsForPath[i] = new PropertyBinding(object, path, parsedPath);
    }

    return bindingsForPath;
  }

  unsubscribe_(path: string): void {
    const indicesByPath = this._bindingsIndicesByPath;
    const index = indicesByPath[path];

    if (index !== undefined) {
      const paths = this._paths;
      const parsedPaths = this._parsedPaths;
      const bindings = this._bindings;
      const lastBindingsIndex = bindings.length - 1;
      const lastBindings = bindings[lastBindingsIndex]!;
      const lastBindingsPath = paths[lastBindingsIndex]!;

      indicesByPath[lastBindingsPath] = index;

      bindings[index] = lastBindings;
      bindings.pop();

      parsedPaths[index] = parsedPaths[lastBindingsIndex];
      parsedPaths.pop();

      paths[index] = paths[lastBindingsIndex];
      paths.pop();
    }
  }
}
