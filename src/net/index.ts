/**
 * @fileoverview G3D 5.0 Networking System
 * Complete networking solution with client-server and P2P support.
 * @module net
 */

// Network Manager
export {
  NetworkManager,
  NetworkMode,
  TransportType
} from './NetworkManager';
// Note: BinarySerializer not exported to avoid conflict with serialization module
export type {
  SessionInfo,
  PlayerInfo,
  NetworkManagerConfig
} from './NetworkManager';

// Transports
export {
  WebSocketTransport,
  ConnectionState
} from './WebSocketTransport';
export type {
  ConnectionQuality,
  WebSocketTransportConfig
} from './WebSocketTransport';

export {
  WebRTCTransport,
  RTCConnectionState
} from './WebRTCTransport';
export type {
  ICEServer,
  WebRTCTransportConfig
} from './WebRTCTransport';

// Messages
export {
  NetworkMessage,
  MessagePriority,
  DeliveryMode,
  MessageRegistry,
  MessageQueue
} from './NetworkMessage';
export type {
  MessageType,
  INetworkMessage
} from './NetworkMessage';

// Network Entities
export {
  NetworkAuthority,
  ReplicationMode,
  NetworkIdentityComponent,
  NetworkEntityRegistry,
  InterestManager
} from './NetworkEntity';
export type {
  NetworkId,
  PlayerId,
  NetworkEntityMetadata
} from './NetworkEntity';

// State Synchronization
export {
  SnapshotBuffer,
  DeltaCompressor,
  StatePredictor
} from './StateSync';
export type {
  StateSnapshot,
  StateDelta
} from './StateSync';

// RPC System
export {
  RPCSystem,
  RPCDirection,
  RPCMode
} from './RPCSystem';
export type {
  RPCFunction,
  RPCInvocation
} from './RPCSystem';

// Network Time
export {
  NetworkTime,
  JitterBuffer
} from './NetworkTime';

// ECS Integration
export {
  NetworkSystem
} from './NetworkSystem';
export type {
  IReplicatedComponent
} from './NetworkSystem';

// Core Networking Components
export {
  Connection,
  ConnectionState as ConnState,
  DisconnectReason
} from './Connection';
export type {
  ConnectionStats,
  ConnectionConfig,
  ConnectionEvents
} from './Connection';

export {
  Transport,
  TransportState
} from './Transport';
export type {
  TransportCapabilities,
  TransportConfig,
  TransportStats
} from './Transport';

export {
  TypeRegistry,
  NetworkSerializer,
  JSONNetworkSerializer
} from './Serialization';
export type {
  Serializable,
  TypeNetworkSerializer,
  TypeDeserializer
} from './Serialization';

export {
  BitStreamWriter,
  BitStreamReader
} from './BitStream';

// Replication System
export * from './replication';
