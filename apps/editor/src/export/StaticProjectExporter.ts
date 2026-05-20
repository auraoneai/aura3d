import { createStaticExportHtml, createStaticExportRuntime } from "@galileo3d/editor-runtime";
import type { EditorProject } from "../project/ProjectSerializer";
import { ProjectSerializer } from "../project/ProjectSerializer";

export interface StaticExportFile {
  readonly path: string;
  readonly content: string;
  readonly type: "html" | "json" | "javascript";
}

export interface StaticExportResult {
  readonly files: readonly StaticExportFile[];
  readonly entry: string;
}

export class StaticProjectExporter {
  private readonly serializer = new ProjectSerializer();

  export(project: EditorProject): StaticExportResult {
    this.serializer.validate(project);
    const exportedProject: EditorProject = {
      ...project,
      metadata: {
        ...project.metadata,
        provenance: this.serializer.createEditorProvenance([
          ...(project.metadata.provenance?.operations ?? []),
          { id: "static-export", runtimeApi: "StaticProjectExporter.export", target: "index.html" },
          { id: "static-export-runtime", runtimeApi: "createStaticExportRuntime", target: "runtime.js" }
        ])
      }
    };
    const projectJson = this.serializer.serialize(exportedProject);
    return {
      entry: "index.html",
      files: [
        {
          path: "index.html",
          type: "html",
          content: createStaticExportHtml({ title: project.export.title })
        },
        {
          path: "project.json",
          type: "json",
          content: projectJson
        },
        {
          path: "runtime.js",
          type: "javascript",
          content: createStaticExportRuntime()
        }
      ]
    };
  }
}
