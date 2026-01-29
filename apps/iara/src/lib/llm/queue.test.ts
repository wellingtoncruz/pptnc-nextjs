import { describe, it, expect, vi, beforeEach } from 'vitest'

import { LLMQueue } from './queue'

describe('LLMQueue', () => {
  let queue: LLMQueue

  beforeEach(() => {
    queue = new LLMQueue()
  })

  describe('enqueue', () => {
    it('executes a single task and returns result', async () => {
      const result = await queue.enqueue(() => Promise.resolve('success'))
      expect(result).toBe('success')
    })

    it('executes tasks sequentially', async () => {
      const executionOrder: number[] = []

      const task1 = queue.enqueue(async () => {
        await new Promise(r => setTimeout(r, 50))
        executionOrder.push(1)
        return 1
      })

      const task2 = queue.enqueue(async () => {
        executionOrder.push(2)
        return 2
      })

      const task3 = queue.enqueue(async () => {
        executionOrder.push(3)
        return 3
      })

      await Promise.all([task1, task2, task3])

      expect(executionOrder).toEqual([1, 2, 3])
    })

    it('handles rapid enqueuing correctly', async () => {
      const results: number[] = []

      const promises = Array.from({ length: 10 }, (_, i) =>
        queue.enqueue(async () => {
          results.push(i)
          return i
        })
      )

      const resolved = await Promise.all(promises)

      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
      expect(resolved).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    })

    it('continues processing after task error', async () => {
      const results: string[] = []

      const task1 = queue.enqueue(async () => {
        results.push('task1')
        return 'task1'
      })

      const task2 = queue.enqueue(async () => {
        results.push('task2-start')
        throw new Error('Task 2 failed')
      })

      const task3 = queue.enqueue(async () => {
        results.push('task3')
        return 'task3'
      })

      await expect(task1).resolves.toBe('task1')
      await expect(task2).rejects.toThrow('Task 2 failed')
      await expect(task3).resolves.toBe('task3')

      expect(results).toEqual(['task1', 'task2-start', 'task3'])
    })

    it('returns different types correctly', async () => {
      const strResult = await queue.enqueue(() => Promise.resolve('string'))
      const numResult = await queue.enqueue(() => Promise.resolve(42))
      const objResult = await queue.enqueue(() => Promise.resolve({ foo: 'bar' }))

      expect(strResult).toBe('string')
      expect(numResult).toBe(42)
      expect(objResult).toEqual({ foo: 'bar' })
    })
  })

  describe('pendingCount', () => {
    it('returns 0 when queue is empty', () => {
      expect(queue.pendingCount).toBe(0)
    })

    it('reflects pending tasks count', async () => {
      let resolveFirst: () => void
      const firstTaskPromise = new Promise<void>(r => { resolveFirst = r })

      // First task that blocks until we release it
      const task1 = queue.enqueue(async () => {
        await firstTaskPromise
        return 1
      })

      // These will be pending while task1 is running
      const task2 = queue.enqueue(() => Promise.resolve(2))
      const task3 = queue.enqueue(() => Promise.resolve(3))

      // Wait a tick for tasks to be enqueued
      await new Promise(r => setTimeout(r, 10))

      expect(queue.pendingCount).toBe(2)

      // Release first task
      resolveFirst!()
      await Promise.all([task1, task2, task3])

      expect(queue.pendingCount).toBe(0)
    })
  })

  describe('isActive', () => {
    it('returns false when no task is running', () => {
      expect(queue.isActive).toBe(false)
    })

    it('returns true while task is running', async () => {
      let resolveTask: () => void
      const taskPromise = new Promise<void>(r => { resolveTask = r })

      const task = queue.enqueue(async () => {
        await taskPromise
        return 'done'
      })

      // Wait a tick for task to start
      await new Promise(r => setTimeout(r, 10))

      expect(queue.isActive).toBe(true)

      resolveTask!()
      await task

      expect(queue.isActive).toBe(false)
    })
  })

  describe('clear', () => {
    it('clears pending tasks', async () => {
      let resolveFirst: () => void
      const firstTaskPromise = new Promise<void>(r => { resolveFirst = r })

      const task1 = queue.enqueue(async () => {
        await firstTaskPromise
        return 1
      })

      const task2 = queue.enqueue(() => Promise.resolve(2))
      const task3 = queue.enqueue(() => Promise.resolve(3))

      // Wait a tick for tasks to be enqueued
      await new Promise(r => setTimeout(r, 10))

      expect(queue.pendingCount).toBe(2)

      queue.clear()

      expect(queue.pendingCount).toBe(0)

      // Cleared tasks should reject
      await expect(task2).rejects.toThrow('Queue cleared')
      await expect(task3).rejects.toThrow('Queue cleared')

      // First task should still complete (already running)
      resolveFirst!()
      await expect(task1).resolves.toBe(1)
    })

    it('does not affect currently executing task', async () => {
      const taskStarted = vi.fn()

      let resolveTask: () => void
      const taskPromise = new Promise<void>(r => { resolveTask = r })

      const task = queue.enqueue(async () => {
        taskStarted()
        await taskPromise
        return 'completed'
      })

      // Wait for task to start
      await new Promise(r => setTimeout(r, 10))

      expect(taskStarted).toHaveBeenCalled()

      queue.clear()

      // Task should still complete
      resolveTask!()
      await expect(task).resolves.toBe('completed')
    })
  })
})
