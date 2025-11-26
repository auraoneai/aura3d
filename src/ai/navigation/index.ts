/**
 * @fileoverview G3D Navigation System - AI pathfinding and crowd simulation.
 * Complete navigation solution with BVH acceleration, A* pathfinding,
 * funnel algorithm string pulling, RVO/ORCA avoidance, and crowd management.
 * @module ai/navigation
 */

export {
  NavMesh,
  NavPolygon,
  NavLink,
  NavLinkType,
  NavAreaTypes,
  NavAreaCosts,
} from './NavMesh';

export type {
  NavAreaType,
} from './NavMesh';

export {
  NavMeshGenerator,
  DefaultNavMeshGeneratorConfig,
} from './NavMeshGenerator';

export type {
  NavMeshGeneratorConfig,
} from './NavMeshGenerator';

export {
  NavAgent,
  AgentState,
  SteeringMode,
  DefaultNavAgentConfig,
} from './NavAgent';

export type {
  NavAgentConfig,
} from './NavAgent';

export {
  PathFinder,
  PathStatus,
} from './PathFinder';

export type {
  NavigationPath,
} from './PathFinder';

export {
  PathFollower,
  DefaultPathFollowerConfig,
} from './PathFollower';

export type {
  PathFollowerConfig,
} from './PathFollower';

export {
  ObstacleAvoidance,
  DefaultObstacleAvoidanceConfig,
} from './ObstacleAvoidance';

export type {
  ObstacleAgent,
  StaticObstacle,
  ObstacleAvoidanceConfig,
} from './ObstacleAvoidance';

export {
  CrowdManager,
  CrowdAgent,
  FormationType,
  AgentPriority,
  DefaultCrowdManagerConfig,
} from './CrowdManager';

export type {
  Formation,
  CrowdManagerConfig,
} from './CrowdManager';

export {
  NavigationMeshVolume,
} from './NavigationMeshVolume';

export type {
  HeightQueryResult,
  VolumeQueryResult,
} from './NavigationMeshVolume';
