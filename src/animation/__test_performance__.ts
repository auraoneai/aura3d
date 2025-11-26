/**
 * Performance test for Animation State Machine.
 * Verifies: 100 state machines < 5ms
 */

import { AnimationStateMachine, ParameterType, ConditionOperator } from './AnimationStateMachine';
import { AnimationClip } from './AnimationClip';
import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';

function createTestClip(name: string, duration: number): AnimationClip {
  const clip = new AnimationClip({ name, duration, loop: true });

  clip.addPositionTrack('root', [
    { time: 0, value: new Vector3(0, 0, 0) },
    { time: duration / 2, value: new Vector3(0, 0.1, 0) },
    { time: duration, value: new Vector3(0, 0, 0) }
  ]);

  clip.addRotationTrack('spine', [
    { time: 0, value: Quaternion.identity() },
    { time: duration / 2, value: Quaternion.fromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4) },
    { time: duration, value: Quaternion.identity() }
  ]);

  return clip;
}

function createStateMachine(id: number): AnimationStateMachine {
  const sm = new AnimationStateMachine(`sm_${id}`);

  const idleClip = createTestClip('idle', 1.0);
  const walkClip = createTestClip('walk', 0.8);
  const runClip = createTestClip('run', 0.6);

  sm.addParameter('speed', ParameterType.FLOAT, 0);
  sm.addParameter('jump', ParameterType.TRIGGER, false);

  const idle = sm.addState('idle', idleClip);
  const walk = sm.addState('walk', walkClip);
  const run = sm.addState('run', runClip);

  const idleToWalk = sm.addTransition('idle', 'walk', 0.2);
  idleToWalk.addCondition('speed', ConditionOperator.GREATER, 0.1);

  const walkToRun = sm.addTransition('walk', 'run', 0.2);
  walkToRun.addCondition('speed', ConditionOperator.GREATER, 1.5);

  const runToWalk = sm.addTransition('run', 'walk', 0.2);
  runToWalk.addCondition('speed', ConditionOperator.LESS, 1.5);

  const walkToIdle = sm.addTransition('walk', 'idle', 0.2);
  walkToIdle.addCondition('speed', ConditionOperator.LESS, 0.1);

  sm.setDefaultState('idle');

  return sm;
}

console.log('Performance Test: 100 State Machines');
console.log('=====================================\n');

const stateMachines: AnimationStateMachine[] = [];
for (let i = 0; i < 100; i++) {
  stateMachines.push(createStateMachine(i));
}

const warmupIterations = 10;
for (let i = 0; i < warmupIterations; i++) {
  for (const sm of stateMachines) {
    sm.setParameter('speed', Math.random() * 2);
    sm.update(0.016);
    sm.getPose();
  }
}

const iterations = 100;
const deltaTime = 0.016;
const times: number[] = [];

for (let iter = 0; iter < iterations; iter++) {
  const startTime = performance.now();

  for (const sm of stateMachines) {
    sm.setParameter('speed', Math.random() * 2);
    sm.update(deltaTime);
    sm.getPose();
  }

  const endTime = performance.now();
  times.push(endTime - startTime);
}

const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
const minTime = Math.min(...times);
const maxTime = Math.max(...times);

console.log(`Iterations: ${iterations}`);
console.log(`State Machines: ${stateMachines.length}`);
console.log(`\nResults:`);
console.log(`  Average: ${avgTime.toFixed(3)}ms`);
console.log(`  Min: ${minTime.toFixed(3)}ms`);
console.log(`  Max: ${maxTime.toFixed(3)}ms`);
console.log(`\nRequirement: < 5ms`);
console.log(`Status: ${avgTime < 5 ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`Margin: ${(5 - avgTime).toFixed(3)}ms`);
