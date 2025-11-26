/**
 * example.ts - Visual Scripting Usage Examples
 *
 * Demonstrates how to use the G3D 5.0 Visual Scripting system.
 */

import { ScriptingEngine } from './ScriptingEngine';
import { Graph } from './Graph';
import * as EventNodes from './nodes/EventNodes';
import * as FlowNodes from './nodes/FlowNodes';
import * as MathNodes from './nodes/MathNodes';
import * as LogicNodes from './nodes/LogicNodes';
import * as VariableNodes from './nodes/VariableNodes';
import * as ComponentNodes from './nodes/ComponentNodes';
import * as PhysicsNodes from './nodes/PhysicsNodes';
import * as DebugNodes from './nodes/DebugNodes';

/**
 * Example 1: Simple movement script
 */
export function createMovementScript(): Graph {
    const graph = new Graph({
        name: 'Player Movement',
        description: 'Simple player movement script'
    });

    // Create nodes
    const onUpdate = new EventNodes.OnUpdate();
    const getInputX = new VariableNodes.GetGlobalVariable('inputX');
    const getInputY = new VariableNodes.GetGlobalVariable('inputY');
    const multiply5 = new MathNodes.Multiply();
    const makeVector = new MathNodes.Vector3Scale();
    const setVelocity = new PhysicsNodes.SetVelocity();
    const log = new DebugNodes.Log();

    // Add nodes to graph
    graph.addNode(onUpdate);
    graph.addNode(getInputX);
    graph.addNode(getInputY);
    graph.addNode(multiply5);
    graph.addNode(makeVector);
    graph.addNode(setVelocity);
    graph.addNode(log);

    // Set default values
    multiply5.getInput('b')!.defaultValue = 5;

    // Connect flow
    const onUpdateOut = onUpdate.getOutput('out')!;
    const setVelocityIn = setVelocity.getInput('in')!;
    graph.connect(onUpdateOut, setVelocityIn);

    // Connect data
    const inputXOut = getInputX.getOutput('value')!;
    const multiplyIn = multiply5.getInput('a')!;
    graph.connect(inputXOut, multiplyIn);

    return graph;
}

/**
 * Example 2: Conditional logic with branch
 */
export function createHealthCheckScript(): Graph {
    const graph = new Graph({
        name: 'Health Check',
        description: 'Check player health and trigger game over'
    });

    // Nodes
    const onUpdate = new EventNodes.OnUpdate();
    const getHealth = new VariableNodes.GetGlobalVariable('playerHealth');
    const isLowHealth = new LogicNodes.LessEqual();
    const branch = new FlowNodes.Branch();
    const gameOver = new DebugNodes.Log();
    const continue_ = new DebugNodes.Log();

    // Add to graph
    graph.addNode(onUpdate);
    graph.addNode(getHealth);
    graph.addNode(isLowHealth);
    graph.addNode(branch);
    graph.addNode(gameOver);
    graph.addNode(continue_);

    // Configure
    isLowHealth.getInput('b')!.defaultValue = 20; // Low health threshold
    gameOver.getInput('message')!.defaultValue = 'Game Over!';
    continue_.getInput('message')!.defaultValue = 'Player alive';

    // Connect flow: onUpdate -> branch
    graph.connect(onUpdate.getOutput('out')!, branch.getInput('in')!);
    graph.connect(branch.getOutput('true')!, gameOver.getInput('in')!);
    graph.connect(branch.getOutput('false')!, continue_.getInput('in')!);

    // Connect data: health check
    graph.connect(getHealth.getOutput('value')!, isLowHealth.getInput('a')!);
    graph.connect(isLowHealth.getOutput('result')!, branch.getInput('condition')!);

    return graph;
}

/**
 * Example 3: For loop counter
 */
export function createCounterScript(): Graph {
    const graph = new Graph({
        name: 'Counter Loop',
        description: 'Count from 0 to 10'
    });

    const onStart = new EventNodes.OnStart();
    const forLoop = new FlowNodes.ForLoop();
    const log = new DebugNodes.Log();

    graph.addNode(onStart);
    graph.addNode(forLoop);
    graph.addNode(log);

    // Configure loop
    forLoop.getInput('startIndex')!.defaultValue = 0;
    forLoop.getInput('endIndex')!.defaultValue = 10;

    // Connect
    graph.connect(onStart.getOutput('out')!, forLoop.getInput('in')!);
    graph.connect(forLoop.getOutput('body')!, log.getInput('in')!);
    graph.connect(forLoop.getOutput('index')!, log.getInput('message')!);

    return graph;
}

/**
 * Example 4: Math operations
 */
export function createMathScript(): Graph {
    const graph = new Graph({
        name: 'Math Operations',
        description: 'Perform various math operations'
    });

    const onUpdate = new EventNodes.OnUpdate();
    const getValue = new VariableNodes.GetGlobalVariable('value');
    const add10 = new MathNodes.Add();
    const multiply2 = new MathNodes.Multiply();
    const clamp = new MathNodes.Clamp();
    const setValue = new VariableNodes.SetGlobalVariable('result');

    graph.addNode(onUpdate);
    graph.addNode(getValue);
    graph.addNode(add10);
    graph.addNode(multiply2);
    graph.addNode(clamp);
    graph.addNode(setValue);

    // Configure
    add10.getInput('b')!.defaultValue = 10;
    multiply2.getInput('b')!.defaultValue = 2;
    clamp.getInput('min')!.defaultValue = 0;
    clamp.getInput('max')!.defaultValue = 100;

    // Connect flow
    graph.connect(onUpdate.getOutput('out')!, setValue.getInput('in')!);

    // Connect data: value -> +10 -> *2 -> clamp -> result
    graph.connect(getValue.getOutput('value')!, add10.getInput('a')!);
    graph.connect(add10.getOutput('result')!, multiply2.getInput('a')!);
    graph.connect(multiply2.getOutput('result')!, clamp.getInput('value')!);
    graph.connect(clamp.getOutput('result')!, setValue.getInput('value')!);

    return graph;
}

/**
 * Example 5: Using the engine
 */
export async function runExample() {
    // Create engine
    const engine = new ScriptingEngine({
        enableProfiling: true,
        enableDebugMode: true,
        maxExecutionTime: 100,
        maxNodesPerFrame: 1000
    });

    // Set up global variables
    engine.setGlobalVariable('inputX', 0.5);
    engine.setGlobalVariable('inputY', 0);
    engine.setGlobalVariable('playerHealth', 100);
    engine.setGlobalVariable('value', 5);

    // Create and add graphs
    const movementGraph = createMovementScript();
    const healthGraph = createHealthCheckScript();
    const counterGraph = createCounterScript();
    const mathGraph = createMathScript();

    const entity = { id: 'player1', name: 'Player' };

    engine.addGraph(entity, movementGraph, 'movement');
    engine.addGraph(entity, healthGraph, 'health');
    engine.addGraph(null, counterGraph, 'counter');
    engine.addGraph(null, mathGraph, 'math');

    // Update loop (simulate game loop)
    console.log('Starting visual script execution...\n');

    for (let i = 0; i < 5; i++) {
        console.log(`\n--- Frame ${i} ---`);
        await engine.update(0.016);

        // Simulate input changes
        engine.setGlobalVariable('inputX', Math.sin(i * 0.5));
        engine.setGlobalVariable('playerHealth', 100 - i * 25);
    }

    // Get statistics
    console.log('\n--- Engine Statistics ---');
    console.log(engine.getStats());

    // Get profiling data
    const profilingData = engine.getProfilingData('movement');
    if (profilingData) {
        console.log('\n--- Profiling Data (Movement Graph) ---');
        for (const [nodeId, data] of profilingData) {
            console.log(`Node ${nodeId}: ${data.avgTime.toFixed(3)}ms avg, ${data.count} executions`);
        }
    }

    // Validate all graphs
    console.log('\n--- Graph Validation ---');
    const validation = engine.validateAll();
    for (const [graphId, result] of validation) {
        console.log(`Graph ${graphId}:`);
        console.log(`  Valid: ${result.valid}`);
        if (result.errors.length > 0) {
            console.log(`  Errors:`, result.errors);
        }
        if (result.warnings.length > 0) {
            console.log(`  Warnings:`, result.warnings);
        }
    }

    // Hot reload example
    console.log('\n--- Hot Reload ---');
    const newMovementGraph = createMovementScript();
    const reloaded = engine.hotReload('movement', newMovementGraph);
    console.log(`Hot reload ${reloaded ? 'succeeded' : 'failed'}`);

    console.log('\nExample completed!');
}

/**
 * Example 6: Custom event system
 */
export function eventExample() {
    const engine = new ScriptingEngine();

    // Create graph that responds to custom event
    const graph = new Graph({ name: 'Event Handler' });

    const customEvent = new EventNodes.CustomEvent('PlayerDied');
    const log = new DebugNodes.Log();

    graph.addNode(customEvent);
    graph.addNode(log);

    graph.connect(customEvent.getOutput('out')!, log.getInput('in')!);
    graph.connect(customEvent.getOutput('data')!, log.getInput('message')!);

    engine.addGraph(null, graph);

    // Subscribe to event
    engine.on('PlayerDied', (data) => {
        console.log('Event received:', data);
    });

    // Dispatch event
    engine.dispatchEvent('PlayerDied', { reason: 'fell off map' });

    // Update to process event
    engine.update();
}

// Run examples if this file is executed directly
if (require.main === module) {
    runExample().catch(console.error);
}
