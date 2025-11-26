/**
 * @fileoverview Replication system exports.
 * @module net/replication
 */

export { ReplicationManager } from './ReplicationManager';
export type { ReplicationConfig, ReplicationStats } from './ReplicationManager';
export {
  SnapshotBuffer,
  SnapshotUtils
} from './StateSnapshot';
export type {
  StateSnapshot
} from './StateSnapshot';
export {
  DeltaCompressor
} from './DeltaCompression';
export type {
  DeltaSnapshot,
  DeltaCompressionStats
} from './DeltaCompression';
export {
  InterestManager,
  RelevancySet,
  InterestShape
} from './InterestManagement';
export type {
  InterestArea,
  PositionProvider
} from './InterestManagement';
export {
  NetworkedComponentRegistry,
  SyncRuleBuilder,
  Networked,
  SyncFrequency,
  SyncDirection
} from './NetworkedComponent';
export type {
  INetworkedComponent,
  PropertySyncRule,
  ComponentSyncMetadata
} from './NetworkedComponent';
