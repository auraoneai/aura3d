/**
 * Independently authored, minimal WP-08 catalog documents that each describe
 * one triangle which, after the format's documented axis/unit conversion,
 * faces +Z in glTF space and is wider at its lower edge. Shared by the node
 * registry test and the root-API browser maturity spec. MIT, Aura3D authors.
 */
export interface CatalogSceneFixture {
  readonly id: string;
  /** Extension passed as the asset format. */
  readonly format: string;
  readonly mediaType: string;
  readonly source: string;
}

export const CATALOG_SCENE_FIXTURES: readonly CatalogSceneFixture[] = [
  {
    id: "svg-triangle", format: "svg", mediaType: "image/svg+xml",
    source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"><path d="M0 10 L10 10 L5 0 Z" fill="#ff2020"/></svg>`
  },
  {
    id: "vtk-triangle", format: "vtk", mediaType: "application/x-vtk",
    source: "# vtk DataFile Version 3.0\ntriangle\nASCII\nDATASET POLYDATA\nPOINTS 3 float\n-1 -1 0 1 -1 0 0 1 0\nPOLYGONS 1 4\n3 0 1 2\n"
  },
  {
    id: "dae-triangle", format: "dae", mediaType: "model/vnd.collada+xml",
    source: `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset><unit meter="1" name="meter"/><up_axis>Y_UP</up_axis></asset>
  <library_geometries><geometry id="tri"><mesh>
    <source id="tri-pos"><float_array id="tri-pos-array" count="9">-1 -1 0 1 -1 0 0 1 0</float_array>
      <technique_common><accessor source="#tri-pos-array" count="3" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
    <vertices id="tri-vtx"><input semantic="POSITION" source="#tri-pos"/></vertices>
    <triangles count="1"><input semantic="VERTEX" source="#tri-vtx" offset="0"/><p>0 1 2</p></triangles>
  </mesh></geometry></library_geometries>
  <library_visual_scenes><visual_scene id="scene"><node id="n"><instance_geometry url="#tri"/></node></visual_scene></library_visual_scenes>
  <scene><instance_visual_scene url="#scene"/></scene>
</COLLADA>
`
  },
  {
    id: "usda-triangle", format: "usda", mediaType: "model/vnd.usda",
    source: `#usda 1.0
(
    defaultPrim = "Root"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "Root"
{
    def Mesh "Triangle"
    {
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        point3f[] points = [(-1, -1, 0), (1, -1, 0), (0, 1, 0)]
        uniform bool doubleSided = 1
    }
}
`
  },
  {
    id: "vrml-triangle", format: "wrl", mediaType: "model/vrml",
    source: "#VRML V2.0 utf8\nShape {\n  appearance Appearance { material Material { diffuseColor 1 0.1 0.1 } }\n  geometry IndexedFaceSet {\n    solid FALSE\n    coord Coordinate { point [ -1 -1 0, 1 -1 0, 0 1 0 ] }\n    coordIndex [ 0, 1, 2, -1 ]\n  }\n}\n"
  },
  {
    // LDraw is -Y up in LDU; the loader flips Y and scales to metres.
    id: "ldraw-triangle", format: "ldr", mediaType: "application/x-ldraw",
    source: "0 Aura3D conformance triangle\n0 BFC NOCERTIFY\n3 4 -10 10 0 10 10 0 0 -10 0\n"
  }
];
