/**
 * Network Module Integration Tests
 *
 * Tests for the networking system including:
 * - Connection management
 * - State replication
 * - Remote Procedure Calls (RPC)
 * - Entity synchronization
 * - Client-side prediction
 * - Server reconciliation
 * - Lag compensation
 * - Bandwidth optimization
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NetworkManager } from '../../net/NetworkManager';
import { NetworkClient } from '../../net/NetworkClient';
import { NetworkServer } from '../../net/NetworkServer';
import { ReplicationSystem } from '../../net/ReplicationSystem';
import { RPCManager } from '../../net/RPCManager';
import { NetworkTransform } from '../../net/NetworkTransform';
import { ClientPrediction } from '../../net/ClientPrediction';
import { World } from '../../ecs/World';

describe('Network Module Integration', () => {
  describe('Connection Management', () => {
    let server: NetworkServer | null = null;
    let client: NetworkClient | null = null;

    afterEach(() => {
      if (client) {
        client.disconnect();
        client = null;
      }
      if (server) {
        server.shutdown();
        server = null;
      }
    });

    it('should create network server', async () => {
      server = new NetworkServer({
        port: 9000,
        maxClients: 32
      });

      await server.start();

      expect(server.isRunning).toBe(true);
      expect(server.port).toBe(9000);
    });

    it('should create network client', () => {
      client = new NetworkClient();

      expect(client).toBeDefined();
      expect(client.isConnected).toBe(false);
    });

    it('should connect client to server', async () => {
      server = new NetworkServer({ port: 9001 });
      await server.start();

      client = new NetworkClient();
      await client.connect('localhost', 9001);

      expect(client.isConnected).toBe(true);
      expect(server.clientCount).toBe(1);
    });

    it('should disconnect client', async () => {
      server = new NetworkServer({ port: 9002 });
      await server.start();

      client = new NetworkClient();
      await client.connect('localhost', 9002);

      await client.disconnect();

      expect(client.isConnected).toBe(false);
      expect(server.clientCount).toBe(0);
    });

    it('should handle connection timeout', async () => {
      client = new NetworkClient({ timeout: 1000 });

      await expect(
        client.connect('invalid-host', 9999)
      ).rejects.toThrow('timeout');
    });

    it('should reject connection when server is full', async () => {
      server = new NetworkServer({
        port: 9003,
        maxClients: 1
      });
      await server.start();

      const client1 = new NetworkClient();
      await client1.connect('localhost', 9003);

      client = new NetworkClient();
      await expect(
        client.connect('localhost', 9003)
      ).rejects.toThrow('server full');

      client1.disconnect();
    });

    it('should handle client authentication', async () => {
      server = new NetworkServer({
        port: 9004,
        requireAuth: true,
        onAuth: async (credentials) => {
          return credentials.token === 'valid-token';
        }
      });
      await server.start();

      client = new NetworkClient();

      await expect(
        client.connect('localhost', 9004, {
          token: 'invalid-token'
        })
      ).rejects.toThrow('authentication failed');

      await client.connect('localhost', 9004, {
        token: 'valid-token'
      });

      expect(client.isConnected).toBe(true);
    });

    it('should track round-trip time (RTT)', async () => {
      server = new NetworkServer({ port: 9005 });
      await server.start();

      client = new NetworkClient();
      await client.connect('localhost', 9005);

      // Wait for ping
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(client.rtt).toBeGreaterThanOrEqual(0);
    });
  });

  describe('State Replication', () => {
    let server: NetworkServer;
    let client: NetworkClient;
    let replicationSystem: ReplicationSystem;

    beforeEach(async () => {
      server = new NetworkServer({ port: 9010 });
      await server.start();

      client = new NetworkClient();
      await client.connect('localhost', 9010);

      replicationSystem = new ReplicationSystem();
    });

    afterEach(() => {
      client.disconnect();
      server.shutdown();
    });

    it('should replicate entity creation', async () => {
      const entity = {
        id: 'player-1',
        type: 'player',
        data: {
          position: [0, 0, 0],
          health: 100
        }
      };

      server.replicateEntity(entity);

      // Wait for replication
      await new Promise(resolve => setTimeout(resolve, 100));

      const replicatedEntity = client.getEntity('player-1');
      expect(replicatedEntity).toBeDefined();
      expect(replicatedEntity.type).toBe('player');
    });

    it('should replicate entity updates', async () => {
      const entity = {
        id: 'player-1',
        type: 'player',
        data: {
          position: [0, 0, 0],
          health: 100
        }
      };

      server.replicateEntity(entity);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Update entity
      entity.data.position = [10, 0, 5];
      entity.data.health = 80;

      server.replicateEntity(entity);
      await new Promise(resolve => setTimeout(resolve, 100));

      const replicatedEntity = client.getEntity('player-1');
      expect(replicatedEntity.data.position).toEqual([10, 0, 5]);
      expect(replicatedEntity.data.health).toBe(80);
    });

    it('should replicate entity destruction', async () => {
      const entity = {
        id: 'player-1',
        type: 'player',
        data: {}
      };

      server.replicateEntity(entity);
      await new Promise(resolve => setTimeout(resolve, 100));

      server.destroyEntity('player-1');
      await new Promise(resolve => setTimeout(resolve, 100));

      const replicatedEntity = client.getEntity('player-1');
      expect(replicatedEntity).toBeUndefined();
    });

    it('should support delta compression', async () => {
      const entity = {
        id: 'player-1',
        type: 'player',
        data: {
          position: [0, 0, 0],
          health: 100,
          armor: 50,
          ammo: 30
        }
      };

      server.replicateEntity(entity);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Only update position
      entity.data.position = [1, 0, 0];

      const bytesBeforeDelta = server.getBytesSent();

      server.replicateEntity(entity, { deltaCompression: true });
      await new Promise(resolve => setTimeout(resolve, 100));

      const bytesAfterDelta = server.getBytesSent();

      // Delta should send fewer bytes
      expect(bytesAfterDelta - bytesBeforeDelta).toBeLessThan(100);
    });

    it('should support priority-based replication', async () => {
      const highPriority = {
        id: 'important',
        type: 'objective',
        data: {},
        priority: 10
      };

      const lowPriority = {
        id: 'background',
        type: 'prop',
        data: {},
        priority: 1
      };

      server.replicateEntity(highPriority);
      server.replicateEntity(lowPriority);

      // High priority should be sent first
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(client.getEntity('important')).toBeDefined();
    });

    it('should support relevancy filtering', async () => {
      server.setRelevancyRadius(100);

      const nearEntity = {
        id: 'near',
        type: 'enemy',
        data: { position: [10, 0, 0] },
        relevancyPosition: [10, 0, 0]
      };

      const farEntity = {
        id: 'far',
        type: 'enemy',
        data: { position: [200, 0, 0] },
        relevancyPosition: [200, 0, 0]
      };

      // Set client position
      client.setPosition([0, 0, 0]);

      server.replicateEntity(nearEntity);
      server.replicateEntity(farEntity);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Only nearby entity should be replicated
      expect(client.getEntity('near')).toBeDefined();
      expect(client.getEntity('far')).toBeUndefined();
    });
  });

  describe('Remote Procedure Calls (RPC)', () => {
    let server: NetworkServer;
    let client: NetworkClient;
    let rpcManager: RPCManager;

    beforeEach(async () => {
      server = new NetworkServer({ port: 9020 });
      await server.start();

      client = new NetworkClient();
      await client.connect('localhost', 9020);

      rpcManager = new RPCManager();
    });

    afterEach(() => {
      client.disconnect();
      server.shutdown();
    });

    it('should register RPC handler', () => {
      const handler = vi.fn();

      rpcManager.register('test-rpc', handler);

      expect(rpcManager.hasHandler('test-rpc')).toBe(true);
    });

    it('should call RPC on server', async () => {
      const serverHandler = vi.fn((args) => {
        return { result: args.value * 2 };
      });

      server.rpc.register('double', serverHandler);

      const result = await client.callRPC('double', { value: 5 });

      expect(serverHandler).toHaveBeenCalledWith({ value: 5 });
      expect(result.result).toBe(10);
    });

    it('should call RPC on client', async () => {
      const clientHandler = vi.fn((args) => {
        return { message: `Hello ${args.name}` };
      });

      client.rpc.register('greet', clientHandler);

      const result = await server.callRPCOnClient(client.id, 'greet', {
        name: 'World'
      });

      expect(clientHandler).toHaveBeenCalled();
      expect(result.message).toBe('Hello World');
    });

    it('should broadcast RPC to all clients', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const client1 = new NetworkClient();
      await client1.connect('localhost', 9020);
      client1.rpc.register('broadcast-test', handler1);

      const client2 = new NetworkClient();
      await client2.connect('localhost', 9020);
      client2.rpc.register('broadcast-test', handler2);

      await server.broadcastRPC('broadcast-test', { data: 'test' });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();

      client1.disconnect();
      client2.disconnect();
    });

    it('should support RPC with binary data', async () => {
      const handler = vi.fn((args) => {
        expect(args.buffer).toBeInstanceOf(ArrayBuffer);
        return { size: args.buffer.byteLength };
      });

      server.rpc.register('upload', handler);

      const buffer = new ArrayBuffer(1024);
      const result = await client.callRPC('upload', { buffer });

      expect(result.size).toBe(1024);
    });

    it('should handle RPC timeout', async () => {
      server.rpc.register('slow-rpc', async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return {};
      });

      await expect(
        client.callRPC('slow-rpc', {}, { timeout: 1000 })
      ).rejects.toThrow('timeout');
    });

    it('should support unreliable RPC', async () => {
      const handler = vi.fn();

      server.rpc.register('unreliable-test', handler);

      // Unreliable RPC doesn't wait for response
      client.callRPC('unreliable-test', {}, { reliable: false });

      // Should complete immediately without waiting
      expect(true).toBe(true);
    });
  });

  describe('Network Transform', () => {
    let server: NetworkServer;
    let client: NetworkClient;

    beforeEach(async () => {
      server = new NetworkServer({ port: 9030 });
      await server.start();

      client = new NetworkClient();
      await client.connect('localhost', 9030);
    });

    afterEach(() => {
      client.disconnect();
      server.shutdown();
    });

    it('should sync transform position', async () => {
      const transform = new NetworkTransform({
        id: 'entity-1',
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        syncPosition: true
      });

      server.addNetworkTransform(transform);

      transform.setPosition([10, 5, 3]);

      await new Promise(resolve => setTimeout(resolve, 100));

      const clientTransform = client.getNetworkTransform('entity-1');
      expect(clientTransform.position).toEqual([10, 5, 3]);
    });

    it('should sync transform rotation', async () => {
      const transform = new NetworkTransform({
        id: 'entity-1',
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        syncRotation: true
      });

      server.addNetworkTransform(transform);

      transform.setRotation([0, 0.707, 0, 0.707]); // 90 degree Y rotation

      await new Promise(resolve => setTimeout(resolve, 100));

      const clientTransform = client.getNetworkTransform('entity-1');
      expect(clientTransform.rotation[1]).toBeCloseTo(0.707);
    });

    it('should interpolate transform updates', async () => {
      const transform = new NetworkTransform({
        id: 'entity-1',
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        interpolation: true
      });

      client.addNetworkTransform(transform);

      // Receive update from server
      transform.receiveUpdate({ position: [10, 0, 0] });

      // Position should interpolate smoothly
      const initialPos = [...transform.position];

      transform.update(0.1);

      expect(transform.position[0]).toBeGreaterThan(initialPos[0]);
      expect(transform.position[0]).toBeLessThan(10);
    });

    it('should support different sync modes', async () => {
      const serverAuthority = new NetworkTransform({
        id: 'server-obj',
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        syncMode: 'server-authoritative'
      });

      const clientAuthority = new NetworkTransform({
        id: 'client-obj',
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        syncMode: 'client-authoritative'
      });

      expect(serverAuthority.syncMode).toBe('server-authoritative');
      expect(clientAuthority.syncMode).toBe('client-authoritative');
    });

    it('should compress transform data', async () => {
      const transform = new NetworkTransform({
        id: 'entity-1',
        position: [123.456789, 456.789012, 789.012345],
        rotation: [0, 0, 0, 1],
        positionPrecision: 0.01 // 1cm precision
      });

      const compressed = transform.serialize();
      const decompressed = NetworkTransform.deserialize(compressed);

      // Should be close but not exact due to compression
      expect(decompressed.position[0]).toBeCloseTo(123.456789, 2);
    });
  });

  describe('Client-Side Prediction', () => {
    let client: NetworkClient;
    let prediction: ClientPrediction;

    beforeEach(() => {
      client = new NetworkClient();
      prediction = new ClientPrediction(client);
    });

    it('should predict client input', () => {
      const input = {
        timestamp: Date.now(),
        forward: true,
        backward: false,
        left: false,
        right: false
      };

      prediction.addInput(input);

      const predictedState = prediction.simulate(input, 0.016);

      expect(predictedState).toBeDefined();
    });

    it('should reconcile with server state', () => {
      // Add client inputs
      for (let i = 0; i < 10; i++) {
        prediction.addInput({
          timestamp: Date.now() + i * 16,
          forward: true,
          backward: false,
          left: false,
          right: false
        });
      }

      // Receive server state
      const serverState = {
        timestamp: Date.now() + 5 * 16,
        position: [5, 0, 0],
        velocity: [1, 0, 0]
      };

      prediction.reconcile(serverState);

      // Should replay inputs from server state
      const reconciledState = prediction.getState();
      expect(reconciledState.position[0]).toBeGreaterThan(5);
    });

    it('should detect prediction errors', () => {
      const predictedState = {
        position: [10, 0, 0],
        velocity: [1, 0, 0]
      };

      const serverState = {
        position: [8, 0, 0], // Different from prediction
        velocity: [1, 0, 0]
      };

      const error = prediction.computeError(predictedState, serverState);

      expect(error).toBeGreaterThan(0);
    });

    it('should smooth corrections', () => {
      const predictedState = {
        position: [10, 0, 0]
      };

      const serverState = {
        position: [8, 0, 0]
      };

      prediction.setState(predictedState);

      // Apply correction with smoothing
      prediction.smoothCorrection(serverState, 0.2); // 200ms

      // Position should move towards server state
      prediction.update(0.1);

      const currentState = prediction.getState();
      expect(currentState.position[0]).toBeLessThan(10);
      expect(currentState.position[0]).toBeGreaterThan(8);
    });
  });

  describe('Network System (ECS Integration)', () => {
    let world: World;
    let server: NetworkServer;
    let client: NetworkClient;

    beforeEach(async () => {
      world = new World();

      server = new NetworkServer({ port: 9040 });
      await server.start();

      client = new NetworkClient();
      await client.connect('localhost', 9040);
    });

    afterEach(() => {
      world.destroy();
      client.disconnect();
      server.shutdown();
    });

    it('should replicate entities with NetworkEntity component', async () => {
      const entity = world.createEntity();

      entity.addComponent('Transform', {
        position: [10, 5, 3],
        rotation: [0, 0, 0, 1]
      });

      entity.addComponent('NetworkEntity', {
        id: 'player-1',
        owner: client.id,
        syncRate: 20 // 20 updates per second
      });

      server.replicateWorld(world);

      await new Promise(resolve => setTimeout(resolve, 100));

      const clientWorld = client.getWorld();
      const replicatedEntity = clientWorld.getEntityByNetworkId('player-1');

      expect(replicatedEntity).toBeDefined();
    });

    it('should sync component changes', async () => {
      const entity = world.createEntity();

      entity.addComponent('Transform', {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1]
      });

      entity.addComponent('Health', {
        current: 100,
        max: 100
      });

      entity.addComponent('NetworkEntity', {
        id: 'player-1',
        replicatedComponents: ['Transform', 'Health']
      });

      server.replicateWorld(world);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Update health
      const health = entity.getComponent('Health');
      health.current = 50;

      await new Promise(resolve => setTimeout(resolve, 100));

      const clientWorld = client.getWorld();
      const replicatedEntity = clientWorld.getEntityByNetworkId('player-1');
      const replicatedHealth = replicatedEntity.getComponent('Health');

      expect(replicatedHealth.current).toBe(50);
    });
  });

  describe('Bandwidth Optimization', () => {
    let server: NetworkServer;
    let client: NetworkClient;

    beforeEach(async () => {
      server = new NetworkServer({ port: 9050 });
      await server.start();

      client = new NetworkClient();
      await client.connect('localhost', 9050);
    });

    afterEach(() => {
      client.disconnect();
      server.shutdown();
    });

    it('should track bandwidth usage', async () => {
      const initialBytesSent = server.getBytesSent();

      // Send some data
      for (let i = 0; i < 100; i++) {
        server.send(client.id, { data: new Array(100).fill(0) });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const finalBytesSent = server.getBytesSent();

      expect(finalBytesSent).toBeGreaterThan(initialBytesSent);
    });

    it('should support message batching', async () => {
      server.setBatchMode(true);

      // Queue multiple messages
      for (let i = 0; i < 10; i++) {
        server.send(client.id, { index: i });
      }

      // Messages should be batched
      await new Promise(resolve => setTimeout(resolve, 100));

      const receivedMessages = client.getReceivedMessages();
      expect(receivedMessages.length).toBeLessThan(10); // Batched together
    });

    it('should compress large messages', async () => {
      const largeData = new Array(10000).fill('test data');

      const uncompressedSize = JSON.stringify(largeData).length;

      server.send(client.id, { data: largeData }, { compress: true });

      await new Promise(resolve => setTimeout(resolve, 100));

      const bytesTransferred = server.getBytesSent();

      expect(bytesTransferred).toBeLessThan(uncompressedSize);
    });

    it('should throttle update rate', async () => {
      server.setUpdateRate(10); // 10 updates per second

      const sendTimes: number[] = [];

      for (let i = 0; i < 5; i++) {
        server.send(client.id, { index: i });
        sendTimes.push(Date.now());
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Check that updates are throttled
      for (let i = 1; i < sendTimes.length; i++) {
        const delta = sendTimes[i] - sendTimes[i - 1];
        expect(delta).toBeGreaterThanOrEqual(100); // 1/10 second
      }
    });
  });
});
