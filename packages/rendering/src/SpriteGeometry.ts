import { Geometry } from "./Geometry";
import { IndexBuffer } from "./IndexBuffer";
import { VertexBuffer } from "./VertexBuffer";
import { VertexFormat } from "./VertexFormat";

export function createSpriteQuadGeometry(): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3N3T2, 4);
  vertices.setAttribute(0, "position", [-0.5, -0.5, 0]);
  vertices.setAttribute(0, "normal", [0, 0, 1]);
  vertices.setAttribute(0, "uv", [0, 1]);
  vertices.setAttribute(1, "position", [0.5, -0.5, 0]);
  vertices.setAttribute(1, "normal", [0, 0, 1]);
  vertices.setAttribute(1, "uv", [1, 1]);
  vertices.setAttribute(2, "position", [0.5, 0.5, 0]);
  vertices.setAttribute(2, "normal", [0, 0, 1]);
  vertices.setAttribute(2, "uv", [1, 0]);
  vertices.setAttribute(3, "position", [-0.5, 0.5, 0]);
  vertices.setAttribute(3, "normal", [0, 0, 1]);
  vertices.setAttribute(3, "uv", [0, 0]);
  return new Geometry(vertices, new IndexBuffer([0, 1, 2, 0, 2, 3], 4));
}
