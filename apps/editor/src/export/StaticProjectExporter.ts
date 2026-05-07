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
    const projectJson = this.serializer.serialize(project);
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
