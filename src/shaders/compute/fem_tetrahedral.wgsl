// fem_tetrahedral.wgsl
// Finite Element Method - Tetrahedral Mesh Simulation
// Elastic Deformation using Linear FEM

struct FEMNode {
    position: vec3<f32>,
    mass: f32,
    velocity: vec3<f32>,
    isPinned: u32,
    force: vec3<f32>,
    _padding: f32,
}

struct Tetrahedron {
    nodeIndices: array<u32, 4>,
    restVolume: f32,
    invRestMatrix: mat3x3<f32>, // Inverse of rest shape matrix
    _padding: array<f32, 3>,
}

struct FEMParams {
    deltaTime: f32,
    nodeCount: u32,
    tetCount: u32,
    youngModulus: f32,
    poissonRatio: f32,
    density: f32,
    damping: f32,
    gravity: vec3<f32>,
    enablePlasticity: u32,
    yieldStrain: f32,
    maxStrain: f32,
}

@group(0) @binding(0) var<storage, read_write> nodes: array<FEMNode>;
@group(0) @binding(1) var<storage, read> tetrahedra: array<Tetrahedron>;
@group(0) @binding(2) var<uniform> params: FEMParams;

// Calculate deformation gradient F
fn calculateDeformationGradient(tet: Tetrahedron) -> mat3x3<f32> {
    let n0 = nodes[tet.nodeIndices[0]].position;
    let n1 = nodes[tet.nodeIndices[1]].position;
    let n2 = nodes[tet.nodeIndices[2]].position;
    let n3 = nodes[tet.nodeIndices[3]].position;

    // Deformed shape matrix
    let Ds = mat3x3<f32>(
        n1 - n0,
        n2 - n0,
        n3 - n0
    );

    // Deformation gradient F = Ds * Dm^-1
    return Ds * tet.invRestMatrix;
}

// Calculate strain tensor (Green strain)
fn calculateStrain(F: mat3x3<f32>) -> mat3x3<f32> {
    let Ft = transpose(F);
    let I = mat3x3<f32>(
        vec3<f32>(1.0, 0.0, 0.0),
        vec3<f32>(0.0, 1.0, 0.0),
        vec3<f32>(0.0, 0.0, 1.0)
    );
    return 0.5 * (Ft * F - I);
}

// Calculate stress tensor using linear elasticity (Hooke's Law)
fn calculateStress(strain: mat3x3<f32>) -> mat3x3<f32> {
    let E = params.youngModulus;
    let nu = params.poissonRatio;

    // Lame parameters
    let lambda = (E * nu) / ((1.0 + nu) * (1.0 - 2.0 * nu));
    let mu = E / (2.0 * (1.0 + nu));

    // Trace of strain
    let traceStrain = strain[0][0] + strain[1][1] + strain[2][2];

    let I = mat3x3<f32>(
        vec3<f32>(1.0, 0.0, 0.0),
        vec3<f32>(0.0, 1.0, 0.0),
        vec3<f32>(0.0, 0.0, 1.0)
    );

    // Stress = lambda * trace(strain) * I + 2 * mu * strain
    return lambda * traceStrain * I + 2.0 * mu * strain;
}

// Calculate first Piola-Kirchhoff stress
fn calculatePiolaStress(F: mat3x3<f32>, stress: mat3x3<f32>) -> mat3x3<f32> {
    return F * stress;
}

// Step 1: Clear forces
@compute @workgroup_size(256, 1, 1)
fn clearForces(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    if (index >= params.nodeCount) {
        return;
    }

    var node = nodes[index];
    node.force = vec3<f32>(0.0);

    // Apply gravity
    if (node.isPinned == 0u) {
        node.force += params.gravity * node.mass;
    }

    nodes[index] = node;
}

// Step 2: Calculate elastic forces
@compute @workgroup_size(256, 1, 1)
fn calculateElasticForces(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let tetIdx = globalId.x;
    if (tetIdx >= params.tetCount) {
        return;
    }

    let tet = tetrahedra[tetIdx];

    // Calculate deformation gradient
    let F = calculateDeformationGradient(tet);

    // Calculate strain
    let strain = calculateStrain(F);

    // Calculate stress
    let stress = calculateStress(strain);

    // Calculate Piola-Kirchhoff stress
    let P = calculatePiolaStress(F, stress);

    // Calculate forces on nodes
    // H = -volume * P * Dm^-T
    let H = -tet.restVolume * P * transpose(tet.invRestMatrix);

    // Force on nodes 1, 2, 3 (node 0 gets the negative sum)
    let f1 = H[0];
    let f2 = H[1];
    let f3 = H[2];
    let f0 = -(f1 + f2 + f3);

    // Accumulate forces (atomic operations would be ideal)
    // This is a simplified version - proper implementation needs atomics
    var n0 = nodes[tet.nodeIndices[0]];
    var n1 = nodes[tet.nodeIndices[1]];
    var n2 = nodes[tet.nodeIndices[2]];
    var n3 = nodes[tet.nodeIndices[3]];

    n0.force += f0;
    n1.force += f1;
    n2.force += f2;
    n3.force += f3;

    nodes[tet.nodeIndices[0]] = n0;
    nodes[tet.nodeIndices[1]] = n1;
    nodes[tet.nodeIndices[2]] = n2;
    nodes[tet.nodeIndices[3]] = n3;
}

// Step 3: Time integration (explicit Euler)
@compute @workgroup_size(256, 1, 1)
fn integrate(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    if (index >= params.nodeCount) {
        return;
    }

    var node = nodes[index];

    if (node.isPinned != 0u) {
        return;
    }

    // Update velocity
    let acceleration = node.force / node.mass;
    node.velocity += acceleration * params.deltaTime;

    // Apply damping
    node.velocity *= params.damping;

    // Update position
    node.position += node.velocity * params.deltaTime;

    nodes[index] = node;
}

// Step 4: Initialize rest state (call once at startup)
@compute @workgroup_size(256, 1, 1)
fn initializeRestState(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let tetIdx = globalId.x;
    if (tetIdx >= params.tetCount) {
        return;
    }

    var tet = tetrahedra[tetIdx];

    let n0 = nodes[tet.nodeIndices[0]].position;
    let n1 = nodes[tet.nodeIndices[1]].position;
    let n2 = nodes[tet.nodeIndices[2]].position;
    let n3 = nodes[tet.nodeIndices[3]].position;

    // Rest shape matrix Dm
    let Dm = mat3x3<f32>(
        n1 - n0,
        n2 - n0,
        n3 - n0
    );

    // Calculate rest volume
    let det = determinant(Dm);
    tet.restVolume = abs(det) / 6.0;

    // Calculate inverse rest matrix
    // This is simplified - proper implementation needs matrix inversion
    tet.invRestMatrix = inverse(Dm);

    tetrahedra[tetIdx] = tet;
}

// Helper: Matrix determinant (3x3)
fn determinant(m: mat3x3<f32>) -> f32 {
    return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
           m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
           m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}

// Helper: Matrix inverse (3x3)
fn inverse(m: mat3x3<f32>) -> mat3x3<f32> {
    let det = determinant(m);
    if (abs(det) < 0.0001) {
        return mat3x3<f32>(
            vec3<f32>(1.0, 0.0, 0.0),
            vec3<f32>(0.0, 1.0, 0.0),
            vec3<f32>(0.0, 0.0, 1.0)
        );
    }

    let invDet = 1.0 / det;

    var inv: mat3x3<f32>;
    inv[0][0] = (m[1][1] * m[2][2] - m[1][2] * m[2][1]) * invDet;
    inv[0][1] = (m[0][2] * m[2][1] - m[0][1] * m[2][2]) * invDet;
    inv[0][2] = (m[0][1] * m[1][2] - m[0][2] * m[1][1]) * invDet;

    inv[1][0] = (m[1][2] * m[2][0] - m[1][0] * m[2][2]) * invDet;
    inv[1][1] = (m[0][0] * m[2][2] - m[0][2] * m[2][0]) * invDet;
    inv[1][2] = (m[0][2] * m[1][0] - m[0][0] * m[1][2]) * invDet;

    inv[2][0] = (m[1][0] * m[2][1] - m[1][1] * m[2][0]) * invDet;
    inv[2][1] = (m[0][1] * m[2][0] - m[0][0] * m[2][1]) * invDet;
    inv[2][2] = (m[0][0] * m[1][1] - m[0][1] * m[1][0]) * invDet;

    return inv;
}
