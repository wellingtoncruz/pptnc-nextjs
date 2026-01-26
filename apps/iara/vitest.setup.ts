import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock EventSource for SSE tests
class MockEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2

  url: string
  readyState: number = MockEventSource.CONNECTING
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(url: string) {
    this.url = url
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = MockEventSource.OPEN
      if (this.onopen) {
        this.onopen(new Event('open'))
      }
    }, 0)
  }

  addEventListener(type: string, listener: EventListener): void {
    if (type === 'open') this.onopen = listener as (event: Event) => void
    if (type === 'message') this.onmessage = listener as (event: MessageEvent) => void
    if (type === 'error') this.onerror = listener as (event: Event) => void
  }

  removeEventListener(): void {
    // No-op for tests
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED
  }
}

vi.stubGlobal('EventSource', MockEventSource)

// Mock fetch for API tests
vi.stubGlobal('fetch', vi.fn())

// Mock ResizeObserver
vi.stubGlobal('ResizeObserver', class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
})

// Mock IntersectionObserver
vi.stubGlobal('IntersectionObserver', class IntersectionObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
})
