# Shader Graph System Architecture

## Component Hierarchy

```
ShaderGraph (Main Container)
    ├── nodes: Map<string, ShaderNode>
    ├── edges: ShaderEdge[]
    └── Methods:
        ├── addNode(), removeNode(), getNode()
        ├── connect(), disconnect()
        ├── validate() → ValidationResult
        ├── compile(target) → CompilationResult
        └── optimize()

ShaderNode (Abstract Base)
    ├── id: string
    ├── type: string
    ├── inputs: Map<string, NodeInput>
    ├── outputs: Map<string, NodeOutput>
    ├── metadata: NodeMetadata
    └── Methods:
        ├── initializePorts() [abstract]
        ├── generateCode(context, inputs) [abstract]
        ├── validate()
        └── serialize/deserialize()

ShaderEdge (Connection)
    ├── id: string
    ├── from: NodeOutputRef
    ├── to: NodeInputRef
    └── Methods:
        ├── validate(fromNode, toNode)
        └── serialize/deserialize()

NodeLibrary (Factory)
    ├── registry: Map<string, NodeRegistryEntry>
    └── Methods:
        ├── initialize()
        ├── register(type, factory, metadata)
        ├── create(type, id)
        ├── getCategories()
        └── getNodesInCategory(category)

GraphValidator (Static Utility)
    └── Methods:
        ├── validate(graph) → ValidationResult
        ├── detectCycles(graph)
        ├── detectUnreachableNodes(graph)
        ├── getTopologicalOrder(graph)
        └── hasPath(graph, from, to)

GraphSerializer (Static Utility)
    └── Methods:
        ├── serialize(graph) → SerializedGraph
        ├── deserialize(data) → ShaderGraph
        ├── serializeToString(graph)
        ├── deserializeFromString(json)
        ├── exportToBlob(graph)
        └── importFromFile(file)
```

## Data Flow

### 1. Graph Construction
```
User/Editor
    ↓
NodeLibrary.create(type, id)
    ↓
ShaderGraph.addNode(node)
    ↓
ShaderGraph.connect(from, to)
    ↓
ShaderEdge created & validated
    ↓
Graph updated
```

### 2. Validation Flow
```
ShaderGraph.validate()
    ↓
GraphValidator.validate(graph)
    ↓
├── validateNodes()
├── validateEdges()
├── detectCycles()
├── detectUnreachableNodes()
├── validateRequiredConnections()
├── validateValueRanges()
└── detectDeadNodes()
    ↓
ValidationResult {valid, errors, warnings}
```

### 3. Compilation Flow
```
ShaderGraph.compile(target)
    ↓
GraphValidator.validate()
    ↓ (if valid)
GraphValidator.getTopologicalOrder()
    ↓
For each node in order:
    ├── Collect input values from connected edges
    ├── node.generateCode(context, inputs)
    ├── Store outputs for downstream nodes
    └── Update context (variables, uniforms, textures)
    ↓
buildShaderCode(context, target)
    ↓
CompilationResult {success, code, uniforms, textures}
```

### 4. Serialization Flow
```
Save:
ShaderGraph
    ↓
GraphSerializer.serialize(graph)
    ↓
SerializedGraph {version, metadata, nodes[], edges[]}
    ↓
JSON.stringify()
    ↓
File/Storage

Load:
File/Storage
    ↓
JSON.parse()
    ↓
GraphSerializer.deserialize(data)
    ↓
Version migration (if needed)
    ↓
NodeLibrary.create() for each node
    ↓
ShaderGraph with restored nodes & edges
```

## Type System

```
ShaderType = 
    | 'float'      (1 component)
    | 'vec2'       (2 components)
    | 'vec3'       (3 components)
    | 'vec4'       (4 components)
    | 'mat3'       (9 components)
    | 'mat4'       (16 components)
    | 'sampler2D'  (texture)
    | 'samplerCube' (cubemap)
    | 'int'        (1 component)
    | 'bool'       (1 component)

Type Conversion Rules:
    float → vec2, vec3, vec4  ✅ (broadcast)
    vec2 → vec3, vec4         ✅ (zero-padding)
    vec3 → vec4              ✅ (zero-padding)
    Same type                ✅
    All others               ❌
```

## Node Categories

```
Math (18 nodes)
    ├── Basic: Add, Subtract, Multiply, Divide
    ├── Functions: Power, Sqrt, Abs, Sign
    ├── Rounding: Floor, Ceil, Fract, Mod
    ├── Comparison: Min, Max, Clamp
    └── Interpolation: Lerp, Step, Smoothstep

Vector (9 nodes)
    ├── Operations: Split, Combine, Normalize
    ├── Math: Dot, Cross, Length, Distance
    └── Reflection: Reflect, Refract

Texture (4 nodes)
    ├── Sample2D, SampleCube
    ├── SampleNormal
    └── Triplanar

UV (3 nodes)
    ├── TilingOffset
    ├── Rotate
    └── Parallax

Color (4 nodes)
    ├── HSV
    ├── Contrast
    ├── Saturation
    └── Blend

PBR (4 nodes)
    ├── FresnelSchlick
    ├── GGX
    ├── Lambert
    └── CookTorrance

Utility (6 nodes)
    ├── Inputs: Time, ViewDirection, WorldPosition, ScreenPosition
    ├── Constant
    └── Output
```

## Code Generation Context

```typescript
interface CodeGenContext {
    target: 'glsl' | 'wgsl'          // Shader language
    indent: number                    // Current indentation
    variables: Map<string, string>    // Generated variables
    functions: Set<string>            // Required functions
    uniforms: Map<...>                // Uniform declarations
    textures: Map<...>                // Texture bindings
    stage: 'vertex' | 'fragment'     // Shader stage
}
```

## Validation Levels

```
Level 1: Structural
    ├── Output node exists
    ├── All referenced nodes exist
    └── All referenced ports exist

Level 2: Type Safety
    ├── Edge type compatibility
    ├── Type conversion validation
    └── Required input types

Level 3: Graph Topology
    ├── No cycles (DAG enforcement)
    ├── Reachability from output
    └── Dead code detection

Level 4: Value Constraints
    ├── Value range validation
    ├── Enum option validation
    └── Required connection enforcement

Level 5: Optimization Opportunities
    ├── Constant folding candidates
    ├── Redundant node detection
    └── Common subexpression elimination
```

## Extension Points

```
1. Custom Nodes
    └── Extend ShaderNode
    └── Implement initializePorts()
    └── Implement generateCode()
    └── Register with NodeLibrary

2. Custom Validation
    └── Extend GraphValidator
    └── Add custom validation rules

3. Custom Serialization
    └── Override serialize/deserialize
    └── Add migration logic

4. Custom Optimization
    └── Extend ShaderGraph.optimize()
    └── Add optimization passes

5. Custom Targets
    └── Add new CompilationTarget
    └── Implement target-specific code generation
```

## Performance Characteristics

```
Operation               Time Complexity     Space Complexity
─────────────────────────────────────────────────────────────
addNode()               O(1)                O(1)
removeNode()            O(E)                O(1)
connect()               O(1)                O(1)
disconnect()            O(1)                O(1)
validate()              O(V + E)            O(V)
compile()               O(V + E)            O(V + E)
getTopologicalOrder()   O(V + E)            O(V)
detectCycles()          O(V + E)            O(V)
serialize()             O(V + E)            O(V + E)
deserialize()           O(V + E)            O(V + E)

Where:
    V = number of nodes
    E = number of edges
```

## Memory Layout

```
ShaderGraph Instance (~100 bytes + data)
    ├── nodes Map          (~32 bytes + N * node_size)
    ├── edges Array        (~16 bytes + E * edge_size)
    └── metadata          (~40 bytes)

ShaderNode Instance (~200 bytes)
    ├── Base properties    (~80 bytes)
    ├── inputs Map        (~32 bytes + I * input_size)
    ├── outputs Map       (~32 bytes + O * output_size)
    └── properties Map    (~32 bytes + P * property_size)

ShaderEdge Instance (~80 bytes)
    ├── id               (~16 bytes)
    ├── from/to refs     (~48 bytes)
    └── metadata         (~16 bytes)

Typical Graph (50 nodes, 75 edges):
    Base: ~100 bytes
    Nodes: ~10,000 bytes
    Edges: ~6,000 bytes
    Total: ~16 KB
```

## Thread Safety

```
❌ Not Thread-Safe Operations:
    ├── addNode/removeNode
    ├── connect/disconnect
    ├── compile
    └── optimize

✅ Thread-Safe Operations (if graph immutable):
    ├── validate (read-only)
    ├── getNode (read-only)
    └── serialize (read-only)

For concurrent access:
    └── Use external synchronization
    └── Clone graph for parallel operations
```
