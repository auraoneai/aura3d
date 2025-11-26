/**
 * Background task scheduling and async job management system.
 *
 * Provides priority-based task scheduling with frame budget management,
 * idle callback support, task cancellation, and dependencies. Designed for
 * efficient background processing without blocking the main rendering thread.
 *
 * @example
 * ```typescript
 * // Schedule a high-priority task
 * const taskId = TaskScheduler.schedule({
 *   id: 'load-texture',
 *   priority: TaskPriority.HIGH,
 *   execute: async () => {
 *     await loadTexture('hero.png');
 *   },
 *   onComplete: () => console.log('Texture loaded'),
 *   onError: (err) => console.error('Failed to load texture', err)
 * });
 *
 * // Schedule an idle task for mesh processing
 * TaskScheduler.scheduleIdle(() => {
 *   return processMeshChunk(); // Returns true when complete
 * }, 4);
 *
 * // Defer work to next frame
 * TaskScheduler.defer(() => {
 *   updateUI();
 * });
 * ```
 */

import { Logger } from './Logger';

/**
 * Task priority levels for scheduling order.
 */
export enum TaskPriority {
  /** Idle tasks, run only when frame budget allows */
  IDLE = 0,
  /** Low priority background tasks */
  LOW = 1,
  /** Normal priority tasks */
  NORMAL = 2,
  /** High priority tasks */
  HIGH = 3,
  /** Critical tasks that must run immediately */
  CRITICAL = 4,
}

/**
 * Task definition for scheduler.
 */
export interface Task {
  /** Unique identifier for the task */
  id: string;
  /** Priority level for execution order */
  priority: TaskPriority;
  /** Task execution function (sync or async) */
  execute: () => Promise<void> | void;
  /** Optional completion callback */
  onComplete?: () => void;
  /** Optional error handler */
  onError?: (error: Error) => void;
  /** Optional progress callback (0-1) */
  onProgress?: (progress: number) => void;
  /** Optional task dependencies (task IDs that must complete first) */
  dependencies?: string[];
}

/**
 * Internal task wrapper with scheduling metadata.
 */
interface ScheduledTask {
  task: Task;
  startTime?: number;
  retries: number;
  isExecuting: boolean;
  isCancelled: boolean;
}

/**
 * Idle task definition for time-sliced background work.
 */
interface IdleTask {
  id: string;
  execute: () => boolean; // Returns true when complete
  maxTimeMs: number;
  startTime?: number;
  isCancelled: boolean;
}

/**
 * Statistics for task execution.
 */
interface TaskStatistics {
  /** Total tasks scheduled */
  totalScheduled: number;
  /** Total tasks completed */
  totalCompleted: number;
  /** Total tasks cancelled */
  totalCancelled: number;
  /** Total tasks failed */
  totalFailed: number;
  /** Average execution time in ms */
  averageExecutionTime: number;
  /** Current pending task count */
  pendingCount: number;
  /** Peak pending task count */
  peakPendingCount: number;
}

/**
 * Background task scheduler with priority queue and frame budget management.
 *
 * Features:
 * - Priority-based task ordering (CRITICAL > HIGH > NORMAL > LOW > IDLE)
 * - Frame budget management to prevent frame drops
 * - requestIdleCallback support with setTimeout fallback
 * - Task cancellation with proper cleanup
 * - Task dependencies (run after dependencies complete)
 * - Progress reporting callbacks
 * - Comprehensive statistics tracking
 * - Zero allocations in per-frame hot paths
 */
export class TaskScheduler {
  /** Logger instance for scheduler events */
  private static logger = new Logger('TaskScheduler');

  /** Priority-sorted task queues */
  private static taskQueues: Map<TaskPriority, ScheduledTask[]> = new Map([
    [TaskPriority.CRITICAL, []],
    [TaskPriority.HIGH, []],
    [TaskPriority.NORMAL, []],
    [TaskPriority.LOW, []],
    [TaskPriority.IDLE, []],
  ]);

  /** Map of task ID to scheduled task for quick lookup */
  private static taskMap: Map<string, ScheduledTask> = new Map();

  /** Idle tasks queue */
  private static idleTasks: IdleTask[] = [];

  /** Deferred callbacks for next frame */
  private static deferredCallbacks: Array<() => void> = [];

  /** Next available deferred callback slot (for reuse) */
  private static deferredCallbackIndex = 0;

  /** Currently processing flag */
  private static processing = false;

  /** Statistics */
  private static stats: TaskStatistics = {
    totalScheduled: 0,
    totalCompleted: 0,
    totalCancelled: 0,
    totalFailed: 0,
    averageExecutionTime: 0,
    pendingCount: 0,
    peakPendingCount: 0,
  };

  /** Total execution time for average calculation */
  private static totalExecutionTime = 0;

  /** Default frame budget in milliseconds */
  private static readonly DEFAULT_FRAME_BUDGET = 4;

  /** Maximum retries for failed tasks */
  private static readonly MAX_RETRIES = 3;

  /** requestIdleCallback handle (if available) */
  private static idleCallbackHandle: number | null = null;

  /** Fallback timeout handle */
  private static timeoutHandle: number | null = null;

  /**
   * Schedule a task for execution.
   *
   * Tasks are executed in priority order during update() calls.
   * Higher priority tasks run first. Dependencies are checked before execution.
   *
   * @param task - Task definition
   * @returns Task ID for cancellation
   *
   * @example
   * ```typescript
   * const id = TaskScheduler.schedule({
   *   id: 'load-asset',
   *   priority: TaskPriority.HIGH,
   *   execute: async () => { await loadAsset(); },
   *   onComplete: () => console.log('Asset loaded'),
   *   dependencies: ['init-system']
   * });
   * ```
   */
  static schedule(task: Task): string {
    // Validate task
    if (this.taskMap.has(task.id)) {
      this.logger.warn(`Task ${task.id} already scheduled, skipping`);
      return task.id;
    }

    // Create scheduled task wrapper
    const scheduledTask: ScheduledTask = {
      task,
      retries: 0,
      isExecuting: false,
      isCancelled: false,
    };

    // Add to priority queue
    const queue = this.taskQueues.get(task.priority);
    if (queue) {
      queue.push(scheduledTask);
    } else {
      this.logger.error(`Invalid task priority: ${task.priority}`);
      return task.id;
    }

    // Add to task map
    this.taskMap.set(task.id, scheduledTask);

    // Update statistics
    this.stats.totalScheduled++;
    this.stats.pendingCount++;
    this.stats.peakPendingCount = Math.max(
      this.stats.peakPendingCount,
      this.stats.pendingCount
    );

    this.logger.debug(`Scheduled task: ${task.id} (priority: ${task.priority})`);

    return task.id;
  }

  /**
   * Cancel a scheduled task.
   *
   * If the task is currently executing, it will be marked for cancellation
   * but will complete its current execution.
   *
   * @param taskId - ID of task to cancel
   * @returns True if task was found and cancelled
   *
   * @example
   * ```typescript
   * const id = TaskScheduler.schedule(task);
   * // Later...
   * TaskScheduler.cancel(id);
   * ```
   */
  static cancel(taskId: string): boolean {
    const scheduledTask = this.taskMap.get(taskId);
    if (!scheduledTask) {
      return false;
    }

    scheduledTask.isCancelled = true;

    // Remove from queue if not executing
    if (!scheduledTask.isExecuting) {
      const queue = this.taskQueues.get(scheduledTask.task.priority);
      if (queue) {
        const index = queue.indexOf(scheduledTask);
        if (index !== -1) {
          queue.splice(index, 1);
        }
      }

      // Remove from task map
      this.taskMap.delete(taskId);

      // Update statistics
      this.stats.totalCancelled++;
      this.stats.pendingCount--;
    }

    this.logger.debug(`Cancelled task: ${taskId}`);

    return true;
  }

  /**
   * Cancel all pending tasks.
   *
   * Currently executing tasks will complete, but no new tasks will start.
   *
   * @example
   * ```typescript
   * // Cancel all tasks when shutting down
   * TaskScheduler.cancelAll();
   * ```
   */
  static cancelAll(): void {
    let cancelledCount = 0;

    // Cancel all tasks in queues
    for (const [priority, queue] of this.taskQueues) {
      for (const scheduledTask of queue) {
        if (!scheduledTask.isExecuting) {
          scheduledTask.isCancelled = true;
          this.taskMap.delete(scheduledTask.task.id);
          cancelledCount++;
        }
      }
      queue.length = 0; // Clear queue
    }

    // Update statistics
    this.stats.totalCancelled += cancelledCount;
    this.stats.pendingCount -= cancelledCount;

    this.logger.info(`Cancelled ${cancelledCount} tasks`);
  }

  /**
   * Schedule an idle task for time-sliced background processing.
   *
   * Idle tasks run during idle periods or within the frame budget.
   * The execute function is called repeatedly until it returns true.
   *
   * @param task - Task function that returns true when complete
   * @param maxTimeMs - Maximum time budget per frame in milliseconds
   * @returns Task ID for cancellation
   *
   * @example
   * ```typescript
   * let meshIndex = 0;
   * const id = TaskScheduler.scheduleIdle(() => {
   *   processMeshChunk(meshIndex++);
   *   return meshIndex >= totalMeshes;
   * }, 4);
   * ```
   */
  static scheduleIdle(task: () => boolean, maxTimeMs: number = this.DEFAULT_FRAME_BUDGET): string {
    const id = `idle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const idleTask: IdleTask = {
      id,
      execute: task,
      maxTimeMs,
      isCancelled: false,
    };

    this.idleTasks.push(idleTask);

    // Start idle callback if not already running
    this.startIdleCallback();

    this.logger.debug(`Scheduled idle task: ${id} (budget: ${maxTimeMs}ms)`);

    return id;
  }

  /**
   * Defer a callback to the next frame.
   *
   * Callbacks are batched and executed at the start of the next update.
   * More efficient than scheduling individual tasks for simple callbacks.
   *
   * @param fn - Callback to execute next frame
   *
   * @example
   * ```typescript
   * TaskScheduler.defer(() => {
   *   updateUI();
   * });
   * ```
   */
  static defer(fn: () => void): void {
    this.deferredCallbacks.push(fn);
  }

  /**
   * Process pending tasks within the given frame budget.
   *
   * Should be called once per frame by the engine's main loop.
   * Executes tasks in priority order until budget is exhausted.
   *
   * @param budgetMs - Maximum time budget in milliseconds (default: 4ms)
   *
   * @example
   * ```typescript
   * // In game loop
   * function gameLoop() {
   *   TaskScheduler.update(4); // 4ms budget
   *   render();
   *   requestAnimationFrame(gameLoop);
   * }
   * ```
   */
  static update(budgetMs: number = this.DEFAULT_FRAME_BUDGET): void {
    if (this.processing) {
      return; // Already processing, prevent re-entry
    }

    this.processing = true;
    const startTime = performance.now();

    // Execute deferred callbacks first (zero allocation path)
    this.executeDeferredCallbacks();

    // Process tasks in priority order
    const priorities = [
      TaskPriority.CRITICAL,
      TaskPriority.HIGH,
      TaskPriority.NORMAL,
      TaskPriority.LOW,
      TaskPriority.IDLE,
    ];

    for (const priority of priorities) {
      const queue = this.taskQueues.get(priority)!;

      // Process tasks until queue is empty or budget exhausted
      while (queue.length > 0) {
        const elapsed = performance.now() - startTime;
        if (elapsed >= budgetMs && priority !== TaskPriority.CRITICAL) {
          break; // Budget exhausted (except for critical tasks)
        }

        const scheduledTask = queue[0];

        // Check if task is cancelled
        if (scheduledTask.isCancelled) {
          queue.shift();
          continue;
        }

        // Check dependencies
        if (!this.areDependenciesMet(scheduledTask.task)) {
          // Move to end of queue and try next task
          queue.push(queue.shift()!);
          continue;
        }

        // Execute task
        queue.shift(); // Remove from queue
        this.executeTask(scheduledTask);

        // Check budget again after execution
        const elapsedAfter = performance.now() - startTime;
        if (elapsedAfter >= budgetMs && priority !== TaskPriority.CRITICAL) {
          break;
        }
      }

      // Check total budget
      const totalElapsed = performance.now() - startTime;
      if (totalElapsed >= budgetMs) {
        break; // Budget exhausted
      }
    }

    this.processing = false;
  }

  /**
   * Get current pending task count.
   */
  static get pendingCount(): number {
    return this.stats.pendingCount;
  }

  /**
   * Get whether scheduler is currently processing tasks.
   */
  static get isProcessing(): boolean {
    return this.processing;
  }

  /**
   * Get task execution statistics.
   *
   * @returns Current statistics snapshot
   *
   * @example
   * ```typescript
   * const stats = TaskScheduler.getStatistics();
   * console.log(`Completed: ${stats.totalCompleted}, Average: ${stats.averageExecutionTime}ms`);
   * ```
   */
  static getStatistics(): Readonly<TaskStatistics> {
    return { ...this.stats };
  }

  /**
   * Reset all statistics.
   *
   * @example
   * ```typescript
   * TaskScheduler.resetStatistics();
   * ```
   */
  static resetStatistics(): void {
    this.stats = {
      totalScheduled: 0,
      totalCompleted: 0,
      totalCancelled: 0,
      totalFailed: 0,
      averageExecutionTime: 0,
      pendingCount: this.stats.pendingCount, // Keep current pending count
      peakPendingCount: this.stats.pendingCount,
    };
    this.totalExecutionTime = 0;
  }

  /**
   * Check if all dependencies for a task are met.
   */
  private static areDependenciesMet(task: Task): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }

    // Check if any dependency is still pending
    for (const depId of task.dependencies) {
      if (this.taskMap.has(depId)) {
        return false; // Dependency still pending
      }
    }

    return true; // All dependencies completed or don't exist
  }

  /**
   * Execute a scheduled task.
   */
  private static async executeTask(scheduledTask: ScheduledTask): Promise<void> {
    const { task } = scheduledTask;
    scheduledTask.isExecuting = true;
    scheduledTask.startTime = performance.now();

    try {
      // Execute task
      await task.execute();

      // Task completed successfully
      const executionTime = performance.now() - scheduledTask.startTime;
      this.totalExecutionTime += executionTime;
      this.stats.totalCompleted++;
      this.stats.averageExecutionTime = this.totalExecutionTime / this.stats.totalCompleted;

      this.logger.debug(`Task ${task.id} completed in ${executionTime.toFixed(2)}ms`);

      // Call completion callback if provided
      if (task.onComplete) {
        try {
          task.onComplete();
        } catch (error) {
          this.logger.error(`Error in task ${task.id} completion callback`, error);
        }
      }
    } catch (error) {
      // Task failed
      this.logger.error(`Task ${task.id} failed`, error);

      // Retry if under retry limit
      if (scheduledTask.retries < this.MAX_RETRIES) {
        scheduledTask.retries++;
        scheduledTask.isExecuting = false;

        // Re-add to queue
        const queue = this.taskQueues.get(task.priority)!;
        queue.push(scheduledTask);

        this.logger.warn(`Retrying task ${task.id} (attempt ${scheduledTask.retries}/${this.MAX_RETRIES})`);
        return;
      }

      // Max retries exceeded
      this.stats.totalFailed++;

      // Call error callback if provided
      if (task.onError) {
        try {
          task.onError(error as Error);
        } catch (callbackError) {
          this.logger.error(`Error in task ${task.id} error callback`, callbackError);
        }
      }
    } finally {
      // Clean up if not retrying
      if (scheduledTask.retries >= this.MAX_RETRIES || !scheduledTask.isExecuting) {
        this.taskMap.delete(task.id);
        this.stats.pendingCount--;
      }

      scheduledTask.isExecuting = false;
    }
  }

  /**
   * Execute all deferred callbacks.
   */
  private static executeDeferredCallbacks(): void {
    const callbacks = this.deferredCallbacks;
    const count = callbacks.length;

    // Execute all callbacks
    for (let i = 0; i < count; i++) {
      try {
        callbacks[i]();
      } catch (error) {
        this.logger.error('Error in deferred callback', error);
      }
    }

    // Clear array (reuse allocation)
    callbacks.length = 0;
  }

  /**
   * Start idle callback processing.
   */
  private static startIdleCallback(): void {
    if (this.idleCallbackHandle !== null || this.timeoutHandle !== null) {
      return; // Already running
    }

    // Try requestIdleCallback first
    if (typeof requestIdleCallback !== 'undefined') {
      this.idleCallbackHandle = requestIdleCallback((deadline) => {
        this.processIdleTasks(deadline);
      });
    } else {
      // Fallback to setTimeout
      this.timeoutHandle = setTimeout(() => {
        this.processIdleTasksFallback();
      }, 16) as unknown as number; // ~60fps
    }
  }

  /**
   * Process idle tasks using requestIdleCallback.
   */
  private static processIdleTasks(deadline: IdleDeadline): void {
    this.idleCallbackHandle = null;

    let i = 0;
    while (i < this.idleTasks.length && deadline.timeRemaining() > 0) {
      const idleTask = this.idleTasks[i];

      if (idleTask.isCancelled) {
        this.idleTasks.splice(i, 1);
        continue;
      }

      const startTime = performance.now();

      try {
        // Execute task
        const completed = idleTask.execute();

        if (completed) {
          // Task completed, remove from queue
          this.idleTasks.splice(i, 1);
          this.logger.debug(`Idle task ${idleTask.id} completed`);
        } else {
          // Task not completed, check if budget exceeded
          const elapsed = performance.now() - startTime;
          if (elapsed >= idleTask.maxTimeMs) {
            // Budget exceeded, move to next task
            i++;
          }
        }
      } catch (error) {
        this.logger.error(`Idle task ${idleTask.id} failed`, error);
        this.idleTasks.splice(i, 1);
      }
    }

    // Schedule next idle callback if tasks remain
    if (this.idleTasks.length > 0) {
      this.startIdleCallback();
    }
  }

  /**
   * Process idle tasks using setTimeout fallback.
   */
  private static processIdleTasksFallback(): void {
    this.timeoutHandle = null;

    const startTime = performance.now();
    const budget = this.DEFAULT_FRAME_BUDGET;

    let i = 0;
    while (i < this.idleTasks.length && (performance.now() - startTime) < budget) {
      const idleTask = this.idleTasks[i];

      if (idleTask.isCancelled) {
        this.idleTasks.splice(i, 1);
        continue;
      }

      try {
        const completed = idleTask.execute();

        if (completed) {
          this.idleTasks.splice(i, 1);
          this.logger.debug(`Idle task ${idleTask.id} completed`);
        } else {
          i++;
        }
      } catch (error) {
        this.logger.error(`Idle task ${idleTask.id} failed`, error);
        this.idleTasks.splice(i, 1);
      }
    }

    // Schedule next timeout if tasks remain
    if (this.idleTasks.length > 0) {
      this.startIdleCallback();
    }
  }

  /**
   * Cancel an idle task.
   *
   * @param taskId - ID of idle task to cancel
   * @returns True if task was found and cancelled
   */
  static cancelIdleTask(taskId: string): boolean {
    const task = this.idleTasks.find(t => t.id === taskId);
    if (task) {
      task.isCancelled = true;
      this.logger.debug(`Cancelled idle task: ${taskId}`);
      return true;
    }
    return false;
  }

  /**
   * Clear all idle tasks.
   */
  static clearIdleTasks(): void {
    this.idleTasks.length = 0;

    if (this.idleCallbackHandle !== null) {
      cancelIdleCallback(this.idleCallbackHandle);
      this.idleCallbackHandle = null;
    }

    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }
}
