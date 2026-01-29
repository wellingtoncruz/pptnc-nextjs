/**
 * LLM Call Queue
 *
 * Ensures LLM calls are processed sequentially to prevent:
 * - Rate limiting from Vertex AI
 * - Performance degradation from concurrent calls
 * - Unpredictable behavior when multiple videos are processed
 *
 * @example
 * ```typescript
 * const result = await llmQueue.enqueue(() => callLLM(phase, video, podcast))
 * ```
 */

type QueuedTask<T> = {
  execute: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

class LLMQueue {
  private queue: QueuedTask<unknown>[] = []
  private isProcessing = false

  /**
   * Enqueue a task to be executed sequentially.
   * Returns a promise that resolves when the task completes.
   */
  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        execute: task,
        resolve: resolve as (v: unknown) => void,
        reject,
      })
      this.processNext()
    })
  }

  /**
   * Process the next task in the queue.
   * Only one task runs at a time.
   */
  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return

    this.isProcessing = true
    const task = this.queue.shift()!

    try {
      const result = await task.execute()
      task.resolve(result)
    } catch (error) {
      task.reject(error)
    } finally {
      this.isProcessing = false
      this.processNext()
    }
  }

  /**
   * Number of pending tasks in the queue (not including current).
   * Useful for monitoring and debugging.
   */
  get pendingCount(): number {
    return this.queue.length
  }

  /**
   * Whether a task is currently being processed.
   */
  get isActive(): boolean {
    return this.isProcessing
  }

  /**
   * Clear all pending tasks from the queue.
   * Does not cancel the currently executing task.
   */
  clear(): void {
    const pending = this.queue.splice(0)
    for (const task of pending) {
      task.reject(new Error('Queue cleared'))
    }
  }
}

/**
 * Singleton instance of the LLM queue.
 * All LLM calls should go through this queue.
 */
export const llmQueue = new LLMQueue()

/**
 * Export the class for testing purposes.
 */
export { LLMQueue }
