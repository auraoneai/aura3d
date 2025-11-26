# Shader Graph Quick Start Guide

## Installation

```typescript
import {
  ShaderGraph,
  NodeLibrary,
  GraphValidator,
  GraphSerializer
} from './shaders/graph';
```

## Basic Usage

### 1. Initialize the Library

```typescript
NodeLibrary.initialize();
```

### 2. Create a Graph

```typescript
const graph = new ShaderGraph('My Shader');
```

### 3. Create Nodes

```typescript
// Create nodes by type
const texNode = NodeLibrary.create('texture.sample2D', 'tex-1');
const colorNode = NodeLibrary.create('color.hsv', 'color-1');
const outputNode = NodeLibrary.create('utility.output', 'output');

// Add to graph
graph.addNode(texNode);
graph.addNode(colorNode);
graph.addNode(outputNode);
```

### 4. Connect Nodes

```typescript
graph.connect(
  { nodeId: 'tex-1', outputName: 'rgb' },
  { nodeId: 'color-1', inputName: 'color' }
);

graph.connect(
  { nodeId: 'color-1', outputName: 'result' },
  { nodeId: 'output', inputName: 'albedo' }
);
```

### 5. Validate

```typescript
const validation = graph.validate();
if (!validation.valid) {
  console.error(validation.errors);
}
```

### 6. Compile

```typescript
const result = graph.compile('glsl');
if (result.success) {
  console.log(result.code);
}
```

## Available Node Categories

### Math (18 nodes)
```typescript
'math.add', 'math.subtract', 'math.multiply', 'math.divide'
'math.power', 'math.sqrt', 'math.abs', 'math.sign'
'math.floor', 'math.ceil', 'math.fract', 'math.mod'
'math.min', 'math.max', 'math.clamp'
'math.lerp', 'math.step', 'math.smoothstep'
```

### Vector (9 nodes)
```typescript
'vector.split', 'vector.combine', 'vector.normalize'
'vector.dot', 'vector.cross'
'vector.length', 'vector.distance'
'vector.reflect', 'vector.refract'
```

### Texture (4 nodes)
```typescript
'texture.sample2D', 'texture.sampleCube'
'texture.sampleNormal', 'texture.triplanar'
```

### UV (3 nodes)
```typescript
'uv.tilingOffset', 'uv.rotate', 'uv.parallax'
```

### Color (4 nodes)
```typescript
'color.hsv', 'color.contrast'
'color.saturation', 'color.blend'
```

### PBR (4 nodes)
```typescript
'pbr.fresnel', 'pbr.ggx'
'pbr.lambert', 'pbr.cookTorrance'
```

### Utility (6 nodes)
```typescript
'utility.time', 'utility.viewDirection'
'utility.worldPosition', 'utility.screenPosition'
'utility.constant', 'utility.output'
```

## Common Patterns

### Simple Material

```typescript
const albedo = NodeLibrary.create('utility.constant', 'albedo');
albedo.setProperty('valueType', 'vec3');
albedo.setProperty('value', [1, 0, 0]);

const roughness = NodeLibrary.create('utility.constant', 'rough');
roughness.setProperty('value', 0.5);

const output = NodeLibrary.create('utility.output', 'out');

graph.addNode(albedo);
graph.addNode(roughness);
graph.addNode(output);

graph.connect(
  { nodeId: 'albedo', outputName: 'value' },
  { nodeId: 'out', inputName: 'albedo' }
);
graph.connect(
  { nodeId: 'rough', outputName: 'value' },
  { nodeId: 'out', inputName: 'roughness' }
);
```

### Textured Material

```typescript
const tex = NodeLibrary.create('texture.sample2D', 'tex');
const normalTex = NodeLibrary.create('texture.sampleNormal', 'norm');
const output = NodeLibrary.create('utility.output', 'out');

graph.addNode(tex);
graph.addNode(normalTex);
graph.addNode(output);

graph.connect(
  { nodeId: 'tex', outputName: 'rgb' },
  { nodeId: 'out', inputName: 'albedo' }
);
graph.connect(
  { nodeId: 'norm', outputName: 'normal' },
  { nodeId: 'out', inputName: 'normal' }
);
```

### Math Operations

```typescript
const a = NodeLibrary.create('utility.constant', 'a');
const b = NodeLibrary.create('utility.constant', 'b');
const add = NodeLibrary.create('math.add', 'add');
const mul = NodeLibrary.create('math.multiply', 'mul');

graph.connect(
  { nodeId: 'a', outputName: 'value' },
  { nodeId: 'add', inputName: 'a' }
);
graph.connect(
  { nodeId: 'b', outputName: 'value' },
  { nodeId: 'add', inputName: 'b' }
);
graph.connect(
  { nodeId: 'add', outputName: 'result' },
  { nodeId: 'mul', inputName: 'a' }
);
```

## Serialization

### Save

```typescript
// To JSON
const json = GraphSerializer.serializeToString(graph, {
  prettyPrint: true,
  indent: 2
});

// To Blob
const blob = GraphSerializer.exportToBlob(graph);
```

### Load

```typescript
// From JSON
const graph = GraphSerializer.deserializeFromString(json);

// From File
const graph = await GraphSerializer.importFromFile(file);
```

## Validation

```typescript
const result = graph.validate();

// Check validity
if (result.valid) {
  console.log('Graph is valid');
} else {
  // Show errors
  result.errors.forEach(err => {
    console.error(`${err.severity}: ${err.message}`);
    if (err.nodeId) console.error(`  Node: ${err.nodeId}`);
  });
  
  // Show warnings
  result.warnings.forEach(warn => {
    console.warn(`${warn.severity}: ${warn.message}`);
  });
}
```

## Compilation

```typescript
// Compile to GLSL
const glsl = graph.compile('glsl');

// Compile to WGSL
const wgsl = graph.compile('wgsl');

// Check result
if (glsl.success) {
  console.log('Shader Code:', glsl.code);
  console.log('Uniforms:', glsl.uniforms);
  console.log('Textures:', glsl.textures);
} else {
  console.error('Compilation failed:', glsl.errors);
}
```

## Optimization

```typescript
// Optimize graph
const optimizations = graph.optimize();
console.log(`Applied ${optimizations} optimizations`);

// Removes:
// - Dead nodes (not connected to output)
// - Constant expressions (when implemented)
```

## Query Operations

```typescript
// Find nodes by type
const mathNodes = graph.findNodesByType('math.add');

// Find nodes by category
const vectorNodes = graph.findNodesByCategory('Vector');

// Get categories in graph
const categories = graph.getUsedCategories();

// Get statistics
const stats = graph.getStatistics();
console.log(`Nodes: ${stats.nodeCount}, Edges: ${stats.edgeCount}`);

// Get specific node
const node = graph.getNode('node-id');

// Get output node
const output = graph.getOutputNode();
```

## Error Handling

```typescript
try {
  // Create node
  const node = NodeLibrary.create('math.add', 'my-node');
  graph.addNode(node);
  
  // Connect
  const edge = graph.connect(
    { nodeId: 'node1', outputName: 'out' },
    { nodeId: 'node2', inputName: 'in' }
  );
  
  if (!edge) {
    console.error('Connection failed');
  }
  
  // Compile
  const result = graph.compile('glsl');
  if (!result.success) {
    throw new Error(result.errors.join(', '));
  }
  
} catch (error) {
  console.error('Error:', error);
}
```

## Best Practices

1. **Always validate before compiling**
```typescript
const validation = graph.validate();
if (validation.valid) {
  const result = graph.compile('glsl');
}
```

2. **Initialize NodeLibrary once**
```typescript
NodeLibrary.initialize(); // Call once at startup
```

3. **Use descriptive node IDs**
```typescript
const node = NodeLibrary.create('math.add', 'albedo_brightness_add');
```

4. **Check connection results**
```typescript
const edge = graph.connect(from, to);
if (!edge) {
  console.error('Connection validation failed');
}
```

5. **Handle serialization errors**
```typescript
try {
  const graph = GraphSerializer.deserializeFromString(json, {
    validate: true,
    skipUnknownNodes: false
  });
} catch (error) {
  console.error('Failed to load graph:', error);
}
```

## Type Reference

```typescript
type ShaderType = 
  | 'float' | 'vec2' | 'vec3' | 'vec4'
  | 'mat3' | 'mat4'
  | 'sampler2D' | 'samplerCube'
  | 'int' | 'bool';

type CompilationTarget = 'glsl' | 'wgsl';

interface NodeInput {
  name: string;
  type: ShaderType;
  defaultValue?: any;
  connection?: string;
}

interface NodeOutput {
  name: string;
  type: ShaderType;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  info: ValidationError[];
}

interface CompilationResult {
  success: boolean;
  code?: string;
  errors?: string[];
  uniforms?: Map<string, { type: ShaderType; binding?: number }>;
  textures?: Map<string, { type: 'sampler2D' | 'samplerCube'; binding: number }>;
}
```

## Next Steps

- Read IMPLEMENTATION_SUMMARY.md for detailed documentation
- Read ARCHITECTURE.md for system design
- Explore NodeLibrary for all available nodes
- Build custom nodes by extending ShaderNode
- Integrate with your material system
