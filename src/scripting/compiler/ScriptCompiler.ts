/**
 * ScriptCompiler.ts - Script Compiler
 *
 * Compiles visual script graphs to optimized executable form.
 */

import { Graph } from '../Graph';
import { Node } from '../Node';
import { TypeChecker, TypeCheckResult } from './TypeChecker';
import { Optimizer, OptimizationResult } from './Optimizer';

/**
 * Compiled graph
 */
export interface CompiledGraph {
    graph: Graph;
    executionOrder: Node[];
    entryPoints: Node[];
    typeCheckResult: TypeCheckResult;
    optimizationResult: OptimizationResult;
    compiledAt: number;
    hash: string;
}

/**
 * Compilation options
 */
export interface CompilationOptions {
    optimize?: boolean;
    typeCheck?: boolean;
    strictMode?: boolean;
    cacheCompiled?: boolean;
}

/**
 * Compilation result
 */
export interface CompilationResult {
    success: boolean;
    compiled?: CompiledGraph;
    errors: string[];
    warnings: string[];
    compilationTime: number;
}

/**
 * Script compiler class
 */
export class ScriptCompiler {
    private _compiledCache: Map<string, CompiledGraph>;
    private _maxCacheSize: number;

    /**
     * Create script compiler
     */
    constructor(maxCacheSize: number = 100) {
        this._compiledCache = new Map();
        this._maxCacheSize = maxCacheSize;
    }

    /**
     * Compile graph
     */
    public compile(graph: Graph, options: CompilationOptions = {}): CompilationResult {
        const startTime = performance.now();
        const errors: string[] = [];
        const warnings: string[] = [];

        const opts = {
            optimize: options.optimize ?? true,
            typeCheck: options.typeCheck ?? true,
            strictMode: options.strictMode ?? false,
            cacheCompiled: options.cacheCompiled ?? true
        };

        try {
            // Check cache
            const hash = this.hashGraph(graph);
            if (opts.cacheCompiled && this._compiledCache.has(hash)) {
                const cached = this._compiledCache.get(hash)!;
                return {
                    success: true,
                    compiled: cached,
                    errors: [],
                    warnings: ['Using cached compiled graph'],
                    compilationTime: performance.now() - startTime
                };
            }

            // Validate graph
            const validation = graph.validate();
            if (!validation.valid) {
                errors.push(...validation.errors);
                if (opts.strictMode) {
                    return {
                        success: false,
                        errors,
                        warnings: validation.warnings,
                        compilationTime: performance.now() - startTime
                    };
                }
            }
            warnings.push(...validation.warnings);

            // Type checking
            let typeCheckResult: TypeCheckResult = {
                valid: true,
                errors: [],
                warnings: []
            };

            if (opts.typeCheck) {
                typeCheckResult = TypeChecker.check(graph);
                errors.push(...typeCheckResult.errors.map(e => e.message));
                warnings.push(...typeCheckResult.warnings.map(w => w.message));

                if (!typeCheckResult.valid && opts.strictMode) {
                    return {
                        success: false,
                        errors,
                        warnings,
                        compilationTime: performance.now() - startTime
                    };
                }
            }

            // Clone graph for compilation (don't modify original)
            const compiledGraph = graph.clone();

            // Optimization
            let optimizationResult: OptimizationResult = {
                optimized: false,
                removedNodes: 0,
                removedEdges: 0,
                optimizations: []
            };

            if (opts.optimize) {
                optimizationResult = Optimizer.optimize(compiledGraph, {
                    constantFolding: true,
                    deadCodeElimination: true,
                    executionOrderOptimization: true
                });
                warnings.push(...optimizationResult.optimizations);
            }

            // Get execution order
            const executionOrder = compiledGraph.getExecutionOrder();

            // Get entry points
            const entryPoints = compiledGraph.getEntryPoints();

            if (entryPoints.length === 0) {
                warnings.push('Graph has no entry points');
            }

            // Create compiled graph
            const compiled: CompiledGraph = {
                graph: compiledGraph,
                executionOrder,
                entryPoints,
                typeCheckResult,
                optimizationResult,
                compiledAt: Date.now(),
                hash
            };

            // Cache compiled graph
            if (opts.cacheCompiled) {
                this.addToCache(hash, compiled);
            }

            return {
                success: true,
                compiled,
                errors,
                warnings,
                compilationTime: performance.now() - startTime
            };

        } catch (error) {
            errors.push(`Compilation error: ${error instanceof Error ? error.message : String(error)}`);
            return {
                success: false,
                errors,
                warnings,
                compilationTime: performance.now() - startTime
            };
        }
    }

    /**
     * Hash graph for caching
     */
    private hashGraph(graph: Graph): string {
        const data = JSON.stringify(graph.toJSON());
        let hash = 0;

        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }

        return hash.toString(36);
    }

    /**
     * Add to cache with LRU eviction
     */
    private addToCache(hash: string, compiled: CompiledGraph): void {
        if (this._compiledCache.size >= this._maxCacheSize) {
            // Remove oldest entry
            const firstKey = this._compiledCache.keys().next().value;
            this._compiledCache.delete(firstKey);
        }

        this._compiledCache.set(hash, compiled);
    }

    /**
     * Clear compilation cache
     */
    public clearCache(): void {
        this._compiledCache.clear();
    }

    /**
     * Get cache statistics
     */
    public getCacheStats(): {
        size: number;
        maxSize: number;
        hitRate: number;
    } {
        return {
            size: this._compiledCache.size,
            maxSize: this._maxCacheSize,
            hitRate: 0 // Would track hits/misses in real implementation
        };
    }

    /**
     * Validate graph before compilation
     */
    public validate(graph: Graph): {
        valid: boolean;
        errors: string[];
        warnings: string[];
    } {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Basic validation
        const validation = graph.validate();
        errors.push(...validation.errors);
        warnings.push(...validation.warnings);

        // Type checking
        const typeCheck = TypeChecker.check(graph);
        errors.push(...typeCheck.errors.map(e => e.message));
        warnings.push(...typeCheck.warnings.map(w => w.message));

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Get compilation statistics
     */
    public getStats(graph: Graph): object {
        const graphStats = graph.getStats();
        const optimizerStats = Optimizer.getStats(graph);

        return {
            graph: graphStats,
            optimizer: optimizerStats,
            cache: this.getCacheStats()
        };
    }

    /**
     * Compile multiple graphs
     */
    public async compileMultiple(
        graphs: Graph[],
        options: CompilationOptions = {}
    ): Promise<CompilationResult[]> {
        const results: CompilationResult[] = [];

        for (const graph of graphs) {
            results.push(this.compile(graph, options));
        }

        return results;
    }

    /**
     * Hot reload - recompile and update
     */
    public hotReload(graph: Graph, options: CompilationOptions = {}): CompilationResult {
        // Clear cache for this graph
        const hash = this.hashGraph(graph);
        this._compiledCache.delete(hash);

        // Recompile
        return this.compile(graph, {
            ...options,
            cacheCompiled: true
        });
    }
}
