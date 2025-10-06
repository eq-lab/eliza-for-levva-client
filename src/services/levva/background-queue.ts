import { type IAgentRuntime } from "@elizaos/core";
import { EventEmitter } from "node:events";
import { delay } from "../../util/async";

const MAX_WAIT_TIME = 15000; // time after which put promise in background
const SUCCESS_EVENT = "bg:success";
const CANCEL_EVENT = "bg:cancel";

export class CancelSignal {
  reject!: (e: Error) => void;
  promise: Promise<void>;
  isCancelled = false;

  constructor() {
    this.promise = new Promise((_, reject) => {
      this.reject = reject;
    });
  }

  cancel(e: Error) {
    this.isCancelled = true;
    this.reject?.(e);
  }

  wait() {
    return this.promise;
  }
}

interface QueueTask<T> {
  promise: Promise<T>;
  signal: CancelSignal;
}

/**
 * Base class for components that need background queue processing
 * Supports task cancellation via CancelSignal
 */
export abstract class BackgroundQueue<T> {
  runtime: IAgentRuntime;

  // Event system for background operations
  private events = new EventEmitter();
  private activeTasks = new Map<string, QueueTask<T>>();

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
    // Use arrow function wrappers to ensure methods are bound correctly
    this.events.on(SUCCESS_EVENT, (event) => this.onBackgroundResolved(event));
    this.events.on(CANCEL_EVENT, (event) => this.onBackgroundCancelled(event));
  }

  /**
   * Cleanup queue resources
   * Should be called by subclasses in their cleanup methods
   */
  protected cleanupQueue() {
    // Cancel all active tasks
    for (const [id, task] of this.activeTasks) {
      const error = new Error("Queue cleanup", { cause: "CancelError" });
      task.signal.cancel(error);
      this.runtime.logger.debug(`Cancelled task during cleanup: ${id}`);
    }

    this.events.removeAllListeners();
    this.activeTasks.clear();
    this.runtime.logger.debug("BackgroundQueue cleanup completed");
  }

  /**
   * Abstract method that subclasses must implement to handle resolved background operations
   * @param event - The resolved event with id and value
   */
  protected abstract onBackgroundResolved(event: {
    id: string;
    value: T;
  }): Promise<void> | void;

  /**
   * Optional method that subclasses can implement to handle cancelled operations
   * @param event - The cancelled event with id
   */
  protected onBackgroundCancelled(event: { id: string }): void {
    this.runtime.logger.debug(`Task cancelled: ${event.id}`);
  }

  /**
   * Execute a function in the background with optional timeout
   * If a promise with the same ID is already active, attaches to it instead of creating a new one
   * Automatically handles cancellation by racing with signal.wait()
   * @param id - Required identifier for the operation (used for deduplication)
   * @param fn - The async function to execute
   * @param waitTime - Maximum time to wait before putting operation in background
   * @returns Promise that resolves with the result or undefined if timeout
   */
  protected inBackground = async (
    id: string,
    fn: () => Promise<T>,
    waitTime = MAX_WAIT_TIME
  ): Promise<T | undefined> => {
    // Check if a task with this ID is already active
    const existingTask = this.activeTasks.get(id);
    if (existingTask) {
      this.runtime.logger.debug(`Attaching to existing promise: ${id}`);
      return Promise.race([existingTask.promise, delay(waitTime, undefined)]);
    }

    // Create CancelSignal for this task
    const signal = new CancelSignal();

    // Race between the function execution and cancellation signal
    const promise = Promise.race([fn(), signal.wait()]) as Promise<T>;
    this.activeTasks.set(id, { promise, signal });

    promise
      .then((value) => {
        this.activeTasks.delete(id);
        this.events.emit(SUCCESS_EVENT, { id, value });
        return value;
      })
      .catch((error) => {
        this.activeTasks.delete(id);

        // Check if error is due to cancellation
        if (error.cause === "CancelError") {
          this.runtime.logger.debug(`Task cancelled: ${id}`);
        } else {
          this.runtime.logger.error(
            `Background promise rejected: ${id}`,
            error
          );
        }

        throw error;
      });

    // Return promise race with timeout
    return Promise.race([promise, delay(waitTime, undefined)]);
  };

  /**
   * Cancel a background task by ID
   * @param id - The identifier of the task to cancel
   * @param reason - Optional reason for cancellation
   * @returns true if task was cancelled, false if task not found
   */
  protected cancelTask(id: string, reason?: string): boolean {
    const task = this.activeTasks.get(id);
    if (!task) {
      this.runtime.logger.debug(`Cannot cancel task: ${id} not found`);
      return false;
    }

    const error = new Error(reason || `Task ${id} cancelled`, {
      cause: "CancelError",
    });
    task.signal.cancel(error);
    this.activeTasks.delete(id);
    this.events.emit(CANCEL_EVENT, { id });
    this.runtime.logger.info(`Cancelled task: ${id}`);
    return true;
  }

  /**
   * Cancel all active background tasks
   * @param reason - Optional reason for cancellation
   * @returns Number of tasks cancelled
   */
  protected cancelAllTasks(reason?: string): number {
    const count = this.activeTasks.size;

    const error = new Error(reason || "All tasks cancelled", {
      cause: "CancelError",
    });

    for (const [id, task] of this.activeTasks) {
      task.signal.cancel(error);
      this.events.emit(CANCEL_EVENT, { id });
    }

    this.activeTasks.clear();
    this.runtime.logger.info(`Cancelled ${count} active tasks`);
    return count;
  }

  /**
   * Get the current number of active background operations
   */
  protected getBackgroundQueueSize(): number {
    return this.activeTasks.size;
  }

  /**
   * Check if there are any active background operations
   */
  protected hasBackgroundOperations(): boolean {
    return this.activeTasks.size > 0;
  }

  /**
   * Get all active task IDs
   */
  protected getActiveTaskIds(): string[] {
    return Array.from(this.activeTasks.keys());
  }

  /**
   * Check if a specific task is active
   */
  protected isTaskActive(id: string): boolean {
    return this.activeTasks.has(id);
  }
}
