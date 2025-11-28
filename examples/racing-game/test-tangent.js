// Quick test to check vertex format semantic values
import { VertexFormat, VertexAttributeSemantic } from '../../dist/esm/index.js';

// Create a format with tangents
const format = VertexFormat.P3N3T4T2();

console.log('=== Vertex Format Test ===');
console.log('Format attributes:', format.attributes);
console.log('');

// Check each attribute
format.attributes.forEach((attr, index) => {
  console.log(`Attribute ${index}:`);
  console.log(`  semantic: "${attr.semantic}"`);
  console.log(`  typeof semantic: ${typeof attr.semantic}`);
  console.log(`  offset: ${attr.offset}`);
  console.log(`  type: ${attr.type}`);
  console.log('');
});

// Test the comparison
console.log('=== String Comparison Tests ===');
const tanAttr = format.attributes.find(a => a.semantic === 'TANGENT');
console.log(`find(a => a.semantic === 'TANGENT'):`, tanAttr);

// Test with enum
const tanAttrEnum = format.attributes.find(a => a.semantic === VertexAttributeSemantic.Tangent);
console.log(`find(a => a.semantic === VertexAttributeSemantic.Tangent):`, tanAttrEnum);

// Check enum value
console.log('');
console.log('VertexAttributeSemantic.Tangent =', VertexAttributeSemantic.Tangent);
console.log('VertexAttributeSemantic.Tangent === "TANGENT":', VertexAttributeSemantic.Tangent === 'TANGENT');
