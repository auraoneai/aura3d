/**
 * Tensor utility functions for creating, converting, and preprocessing tensors.
 * Provides efficient operations for ML model input preparation.
 * @module TensorUtils
 */

import { Vector3 } from '../../math/Vector3';
import { ONNXTensor, TensorDataType, TensorShape } from './ONNXRuntimeWrapper';

/**
 * Creates a tensor from a flat array of numbers.
 * @param data - Input data array
 * @param shape - Desired tensor shape
 * @param type - Data type (default: 'float32')
 * @returns ONNX tensor
 */
export function createTensor(
  data: number[],
  shape: TensorShape,
  type: TensorDataType = 'float32'
): ONNXTensor {
  // Validate shape matches data length
  const totalElements = shape.reduce((a, b) => a * b, 1);
  if (data.length !== totalElements) {
    throw new Error(
      `Data length ${data.length} does not match shape ${shape} (${totalElements} elements)`
    );
  }

  // Create typed array based on type
  let typedData: Float32Array | Int32Array | Uint8Array | BigInt64Array;

  switch (type) {
    case 'float32':
      typedData = new Float32Array(data);
      break;
    case 'int32':
      typedData = new Int32Array(data);
      break;
    case 'uint8':
      typedData = new Uint8Array(data);
      break;
    case 'int64':
      typedData = new BigInt64Array(data.map((x) => BigInt(Math.floor(x))));
      break;
    default:
      throw new Error(`Unsupported tensor type: ${type}`);
  }

  return {
    type,
    dims: shape,
    data: typedData,
  };
}

/**
 * Creates a tensor filled with zeros.
 * @param shape - Tensor shape
 * @param type - Data type (default: 'float32')
 * @returns ONNX tensor filled with zeros
 */
export function zeros(
  shape: TensorShape,
  type: TensorDataType = 'float32'
): ONNXTensor {
  const totalElements = shape.reduce((a, b) => a * b, 1);
  const data = new Array(totalElements).fill(0);
  return createTensor(data, shape, type);
}

/**
 * Creates a tensor filled with ones.
 * @param shape - Tensor shape
 * @param type - Data type (default: 'float32')
 * @returns ONNX tensor filled with ones
 */
export function ones(
  shape: TensorShape,
  type: TensorDataType = 'float32'
): ONNXTensor {
  const totalElements = shape.reduce((a, b) => a * b, 1);
  const data = new Array(totalElements).fill(1);
  return createTensor(data, shape, type);
}

/**
 * Creates a tensor filled with random values from a uniform distribution.
 * @param shape - Tensor shape
 * @param min - Minimum value (default: 0)
 * @param max - Maximum value (default: 1)
 * @param type - Data type (default: 'float32')
 * @returns ONNX tensor filled with random values
 */
export function randomUniform(
  shape: TensorShape,
  min: number = 0,
  max: number = 1,
  type: TensorDataType = 'float32'
): ONNXTensor {
  const totalElements = shape.reduce((a, b) => a * b, 1);
  const data = new Array(totalElements);

  for (let i = 0; i < totalElements; i++) {
    data[i] = min + Math.random() * (max - min);
  }

  return createTensor(data, shape, type);
}

/**
 * Creates a tensor filled with random values from a normal distribution.
 * Uses Box-Muller transform for normal distribution sampling.
 * @param shape - Tensor shape
 * @param mean - Mean of the distribution (default: 0)
 * @param std - Standard deviation (default: 1)
 * @param type - Data type (default: 'float32')
 * @returns ONNX tensor filled with normally distributed values
 */
export function randomNormal(
  shape: TensorShape,
  mean: number = 0,
  std: number = 1,
  type: TensorDataType = 'float32'
): ONNXTensor {
  const totalElements = shape.reduce((a, b) => a * b, 1);
  const data = new Array(totalElements);

  for (let i = 0; i < totalElements; i += 2) {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);

    data[i] = mean + z0 * std;
    if (i + 1 < totalElements) {
      data[i + 1] = mean + z1 * std;
    }
  }

  return createTensor(data, shape, type);
}

/**
 * Converts a Vector3 to a flat tensor.
 * @param vector - Input vector
 * @returns 1D tensor [x, y, z]
 */
export function vectorToTensor(vector: Vector3): ONNXTensor {
  return createTensor([vector.x, vector.y, vector.z], [3], 'float32');
}

/**
 * Converts an array of Vector3 to a batched tensor.
 * @param vectors - Array of vectors
 * @returns 2D tensor [batch_size, 3]
 */
export function vectorArrayToTensor(vectors: Vector3[]): ONNXTensor {
  const data: number[] = [];
  for (const v of vectors) {
    data.push(v.x, v.y, v.z);
  }
  return createTensor(data, [vectors.length, 3], 'float32');
}

/**
 * Converts a tensor back to a Vector3.
 * Expects a tensor with at least 3 elements.
 * @param tensor - Input tensor
 * @param index - Batch index (default: 0)
 * @returns Vector3 instance
 */
export function tensorToVector(tensor: ONNXTensor, index: number = 0): Vector3 {
  const data = tensor.data as Float32Array;
  const stride = tensor.dims[tensor.dims.length - 1];
  const offset = index * stride;

  if (offset + 3 > data.length) {
    throw new Error(`Invalid index ${index} for tensor with shape ${tensor.dims}`);
  }

  return new Vector3(data[offset], data[offset + 1], data[offset + 2]);
}

/**
 * Normalizes a tensor to have zero mean and unit variance.
 * @param tensor - Input tensor
 * @param mean - Optional pre-computed mean (computed if not provided)
 * @param std - Optional pre-computed standard deviation (computed if not provided)
 * @returns Normalized tensor
 */
export function normalizeTensor(
  tensor: ONNXTensor,
  mean?: number,
  std?: number
): ONNXTensor {
  const data = Array.from(tensor.data as Float32Array);

  // Compute mean if not provided
  if (mean === undefined) {
    mean = data.reduce((sum, val) => sum + val, 0) / data.length;
  }

  // Compute standard deviation if not provided
  if (std === undefined) {
    const variance =
      data.reduce((sum, val) => sum + Math.pow(val - mean!, 2), 0) / data.length;
    std = Math.sqrt(variance);
  }

  // Prevent division by zero
  if (std === 0) {
    std = 1;
  }

  // Normalize
  const normalized = data.map((val) => (val - mean!) / std!);
  return createTensor(normalized, tensor.dims, tensor.type);
}

/**
 * Scales a tensor to a specific range.
 * @param tensor - Input tensor
 * @param min - Target minimum value
 * @param max - Target maximum value
 * @returns Scaled tensor
 */
export function scaleTensor(
  tensor: ONNXTensor,
  min: number,
  max: number
): ONNXTensor {
  const data = Array.from(tensor.data as Float32Array);

  // Find current min and max
  const currentMin = Math.min(...data);
  const currentMax = Math.max(...data);

  // Prevent division by zero
  const range = currentMax - currentMin;
  if (range === 0) {
    return createTensor(data.map(() => (min + max) / 2), tensor.dims, tensor.type);
  }

  // Scale to [0, 1] then to [min, max]
  const scaled = data.map((val) => {
    const normalized = (val - currentMin) / range;
    return min + normalized * (max - min);
  });

  return createTensor(scaled, tensor.dims, tensor.type);
}

/**
 * Concatenates tensors along a specified axis.
 * @param tensors - Array of tensors to concatenate
 * @param axis - Axis along which to concatenate (default: 0)
 * @returns Concatenated tensor
 */
export function concatenate(tensors: ONNXTensor[], axis: number = 0): ONNXTensor {
  if (tensors.length === 0) {
    throw new Error('Cannot concatenate empty array of tensors');
  }

  const firstTensor = tensors[0];
  const type = firstTensor.type;
  const dims = [...firstTensor.dims];

  // Validate all tensors have compatible shapes
  for (let i = 1; i < tensors.length; i++) {
    const tensor = tensors[i];
    if (tensor.type !== type) {
      throw new Error('All tensors must have the same type');
    }
    if (tensor.dims.length !== dims.length) {
      throw new Error('All tensors must have the same number of dimensions');
    }
    for (let j = 0; j < dims.length; j++) {
      if (j !== axis && tensor.dims[j] !== dims[j]) {
        throw new Error(`Incompatible shapes at dimension ${j}`);
      }
    }
  }

  // Update concatenation dimension
  dims[axis] = tensors.reduce((sum, t) => sum + t.dims[axis], 0);

  // Concatenate data
  const allData: number[] = [];
  for (const tensor of tensors) {
    allData.push(...Array.from(tensor.data as Float32Array));
  }

  return createTensor(allData, dims, type);
}

/**
 * Stacks tensors along a new dimension.
 * @param tensors - Array of tensors to stack
 * @param axis - Axis along which to stack (default: 0)
 * @returns Stacked tensor
 */
export function stack(tensors: ONNXTensor[], axis: number = 0): ONNXTensor {
  if (tensors.length === 0) {
    throw new Error('Cannot stack empty array of tensors');
  }

  const firstTensor = tensors[0];
  const type = firstTensor.type;
  const baseDims = [...firstTensor.dims];

  // Validate all tensors have the same shape
  for (let i = 1; i < tensors.length; i++) {
    const tensor = tensors[i];
    if (tensor.type !== type) {
      throw new Error('All tensors must have the same type');
    }
    if (tensor.dims.length !== baseDims.length) {
      throw new Error('All tensors must have the same number of dimensions');
    }
    for (let j = 0; j < baseDims.length; j++) {
      if (tensor.dims[j] !== baseDims[j]) {
        throw new Error('All tensors must have the same shape');
      }
    }
  }

  // Create new shape with stacking dimension
  const newDims = [...baseDims];
  newDims.splice(axis, 0, tensors.length);

  // Stack data
  const allData: number[] = [];
  for (const tensor of tensors) {
    allData.push(...Array.from(tensor.data as Float32Array));
  }

  return createTensor(allData, newDims, type);
}

/**
 * Reshapes a tensor to a new shape.
 * Total number of elements must remain the same.
 * @param tensor - Input tensor
 * @param newShape - Target shape
 * @returns Reshaped tensor
 */
export function reshape(tensor: ONNXTensor, newShape: TensorShape): ONNXTensor {
  const oldElements = tensor.dims.reduce((a, b) => a * b, 1);
  const newElements = newShape.reduce((a, b) => a * b, 1);

  if (oldElements !== newElements) {
    throw new Error(
      `Cannot reshape tensor from ${tensor.dims} (${oldElements}) to ${newShape} (${newElements})`
    );
  }

  return {
    type: tensor.type,
    dims: newShape,
    data: tensor.data,
  };
}

/**
 * Applies softmax normalization to a tensor along the last dimension.
 * Converts logits to probabilities.
 * @param tensor - Input tensor (logits)
 * @returns Tensor with softmax applied
 */
export function softmax(tensor: ONNXTensor): ONNXTensor {
  const data = Array.from(tensor.data as Float32Array);
  const lastDim = tensor.dims[tensor.dims.length - 1];
  const batchSize = data.length / lastDim;
  const result: number[] = [];

  for (let b = 0; b < batchSize; b++) {
    const offset = b * lastDim;
    const batch = data.slice(offset, offset + lastDim);

    // Subtract max for numerical stability
    const maxVal = Math.max(...batch);
    const exp = batch.map((x) => Math.exp(x - maxVal));
    const sum = exp.reduce((a, b) => a + b, 0);
    const probabilities = exp.map((x) => x / sum);

    result.push(...probabilities);
  }

  return createTensor(result, tensor.dims, tensor.type);
}

/**
 * Samples from a categorical distribution defined by probabilities.
 * @param probabilities - Probability tensor (should sum to 1)
 * @param temperature - Temperature for sampling (default: 1.0, higher = more random)
 * @returns Sampled index
 */
export function sampleCategorical(
  probabilities: ONNXTensor,
  temperature: number = 1.0
): number {
  const probs = Array.from(probabilities.data as Float32Array);

  // Apply temperature
  let adjusted = probs.map((p) => Math.pow(p, 1 / temperature));
  const sum = adjusted.reduce((a, b) => a + b, 0);
  adjusted = adjusted.map((p) => p / sum);

  // Sample using inverse CDF
  const rand = Math.random();
  let cumulative = 0;

  for (let i = 0; i < adjusted.length; i++) {
    cumulative += adjusted[i];
    if (rand < cumulative) {
      return i;
    }
  }

  return adjusted.length - 1;
}

/**
 * Clips tensor values to a specified range.
 * @param tensor - Input tensor
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clipped tensor
 */
export function clip(tensor: ONNXTensor, min: number, max: number): ONNXTensor {
  const data = Array.from(tensor.data as Float32Array);
  const clipped = data.map((val) => Math.max(min, Math.min(max, val)));
  return createTensor(clipped, tensor.dims, tensor.type);
}
