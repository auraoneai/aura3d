export interface EditorPanelContribution {
  readonly id: string;
  readonly title: string;
  readonly order?: number;
}

export interface EditorToolContribution {
  readonly id: string;
  readonly title: string;
  readonly cursor?: string;
}

export interface EditorImporterContribution {
  readonly id: string;
  readonly label: string;
  readonly extensions: readonly string[];
}

export interface EditorScriptingNodeContribution {
  readonly id: string;
  readonly title: string;
  readonly category: string;
}

export interface EditorPlugin {
  readonly id: string;
  readonly name: string;
  readonly panels?: readonly EditorPanelContribution[];
  readonly tools?: readonly EditorToolContribution[];
  readonly importers?: readonly EditorImporterContribution[];
  readonly scriptingNodes?: readonly EditorScriptingNodeContribution[];
}

export interface EditorPluginSnapshot {
  readonly plugins: readonly EditorPlugin[];
  readonly panels: readonly EditorPanelContribution[];
  readonly tools: readonly EditorToolContribution[];
  readonly importers: readonly EditorImporterContribution[];
  readonly scriptingNodes: readonly EditorScriptingNodeContribution[];
}

export class EditorPluginHost {
  private readonly plugins = new Map<string, EditorPlugin>();

  register(plugin: EditorPlugin): void {
    const id = normalizeId(plugin.id, "plugin");
    if (this.plugins.has(id)) {
      throw new Error(`Editor plugin already registered: ${id}`);
    }
    this.assertUnique(plugin.panels ?? [], "panel", id);
    this.assertUnique(plugin.tools ?? [], "tool", id);
    this.assertUnique(plugin.importers ?? [], "importer", id);
    this.assertUnique(plugin.scriptingNodes ?? [], "scripting node", id);
    this.plugins.set(id, { ...plugin, id });
  }

  unregister(id: string): boolean {
    return this.plugins.delete(normalizeId(id, "plugin"));
  }

  get(id: string): EditorPlugin | undefined {
    return this.plugins.get(normalizeId(id, "plugin"));
  }

  list(): readonly EditorPlugin[] {
    return [...this.plugins.values()];
  }

  snapshot(): EditorPluginSnapshot {
    const plugins = this.list();
    return {
      plugins,
      panels: sortByOrder(plugins.flatMap((plugin) => plugin.panels ?? [])),
      tools: sortByOrder(plugins.flatMap((plugin) => plugin.tools ?? [])),
      importers: plugins.flatMap((plugin) => plugin.importers ?? []),
      scriptingNodes: plugins.flatMap((plugin) => plugin.scriptingNodes ?? [])
    };
  }

  clear(): void {
    this.plugins.clear();
  }

  private assertUnique(contributions: readonly { readonly id: string }[], kind: string, pluginId: string): void {
    const seen = new Set<string>();
    for (const contribution of contributions) {
      const id = normalizeId(contribution.id, kind);
      if (seen.has(id)) {
        throw new Error(`Editor plugin ${pluginId} declares duplicate ${kind}: ${id}`);
      }
      seen.add(id);
    }
  }
}

function normalizeId(id: string, kind: string): string {
  const normalized = id.trim();
  if (!/^[a-z0-9][a-z0-9.-]*$/i.test(normalized)) {
    throw new Error(`Editor ${kind} id must be non-empty and use letters, numbers, dots, or dashes.`);
  }
  return normalized;
}

function sortByOrder<T extends { readonly order?: number; readonly id: string }>(items: readonly T[]): readonly T[] {
  return [...items].sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id));
}
