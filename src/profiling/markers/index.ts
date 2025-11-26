/**
 * Profiling markers module exports
 */

export {
    ProfileMarker,
    ProfileMethod,
    ProfileAsyncMethod
} from './ProfileMarker';
export type {
    ProfileMarkerConfig,
    MarkerColor,
    MarkerCategory
} from './ProfileMarker';

export {
    ScopeMarker,
    ScopeStack,
    using,
    usingAsync,
    scoped,
    scopedAsync,
    getGlobalScopeStack,
    beginScope,
    endScope,
    getScopeDepth
} from './ScopeMarker';

export {
    CounterMarker,
    ScopedCounter
} from './CounterMarker';
export type {
    CounterName,
    CounterDataPoint,
    CounterStatistics
} from './CounterMarker';
