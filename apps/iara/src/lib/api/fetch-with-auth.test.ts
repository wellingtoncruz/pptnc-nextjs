/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchJsonWithAuth, fetchWithAuth, SessionExpiredError } from './fetch-with-auth'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock window.location
const mockLocation = {
  pathname: '/videos',
  search: '?filter=draft',
  href: '',
}

Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
})

describe('fetch-with-auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocation.pathname = '/videos'
    mockLocation.search = '?filter=draft'
    mockLocation.href = ''
  })

  describe('fetchWithAuth', () => {
    it('returns response for successful request', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
      mockFetch.mockResolvedValueOnce(mockResponse)

      const response = await fetchWithAuth('/api/videos')

      expect(response.status).toBe(200)
      expect(mockFetch).toHaveBeenCalledWith('/api/videos', undefined)
    })

    it('passes options to fetch', async () => {
      const mockResponse = new Response('', { status: 200 })
      mockFetch.mockResolvedValueOnce(mockResponse)

      const options = {
        method: 'POST',
        headers: { 'X-Custom': 'header' },
        body: JSON.stringify({ test: true }),
      }

      await fetchWithAuth('/api/videos', options)

      expect(mockFetch).toHaveBeenCalledWith('/api/videos', options)
    })

    it('redirects to login on 401 response', async () => {
      const mockResponse = new Response('', { status: 401 })
      mockFetch.mockResolvedValueOnce(mockResponse)

      await expect(fetchWithAuth('/api/videos')).rejects.toThrow(SessionExpiredError)

      expect(mockLocation.href).toBe('/login?callbackUrl=%2Fvideos%3Ffilter%3Ddraft&expired=true')
    })

    it('preserves current path and query in callbackUrl', async () => {
      mockLocation.pathname = '/settings/prompts'
      mockLocation.search = '?tab=video'

      const mockResponse = new Response('', { status: 401 })
      mockFetch.mockResolvedValueOnce(mockResponse)

      await expect(fetchWithAuth('/api/settings')).rejects.toThrow(SessionExpiredError)

      expect(mockLocation.href).toBe(
        '/login?callbackUrl=%2Fsettings%2Fprompts%3Ftab%3Dvideo&expired=true'
      )
    })

    it('throws SessionExpiredError on 401', async () => {
      const mockResponse = new Response('', { status: 401 })
      mockFetch.mockResolvedValueOnce(mockResponse)

      try {
        await fetchWithAuth('/api/videos')
        expect.fail('Should have thrown SessionExpiredError')
      } catch (error) {
        expect(error).toBeInstanceOf(SessionExpiredError)
        expect((error as SessionExpiredError).name).toBe('SessionExpiredError')
        expect((error as SessionExpiredError).message).toBe('Session expired')
      }
    })

    it('returns non-401 error responses without redirect', async () => {
      const mockResponse = new Response('', { status: 500 })
      mockFetch.mockResolvedValueOnce(mockResponse)

      const response = await fetchWithAuth('/api/videos')

      expect(response.status).toBe(500)
      expect(mockLocation.href).toBe('') // No redirect
    })

    it('returns 403 response without redirect', async () => {
      const mockResponse = new Response('', { status: 403 })
      mockFetch.mockResolvedValueOnce(mockResponse)

      const response = await fetchWithAuth('/api/videos')

      expect(response.status).toBe(403)
      expect(mockLocation.href).toBe('')
    })
  })

  describe('fetchJsonWithAuth', () => {
    it('returns parsed JSON for successful request', async () => {
      const mockData = { videos: [{ id: '1' }, { id: '2' }] }
      const mockResponse = new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
      mockFetch.mockResolvedValueOnce(mockResponse)

      const result = await fetchJsonWithAuth<typeof mockData>('/api/videos')

      expect(result).toEqual(mockData)
    })

    it('adds Content-Type header automatically', async () => {
      const mockResponse = new Response('{}', { status: 200 })
      mockFetch.mockResolvedValueOnce(mockResponse)

      await fetchJsonWithAuth('/api/videos')

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/videos',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      )
    })

    it('merges custom headers with Content-Type', async () => {
      const mockResponse = new Response('{}', { status: 200 })
      mockFetch.mockResolvedValueOnce(mockResponse)

      await fetchJsonWithAuth('/api/videos', {
        headers: { 'X-Custom': 'value' },
      })

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/videos',
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'X-Custom': 'value',
          },
        })
      )
    })

    it('throws SessionExpiredError on 401', async () => {
      const mockResponse = new Response('', { status: 401 })
      mockFetch.mockResolvedValueOnce(mockResponse)

      await expect(fetchJsonWithAuth('/api/videos')).rejects.toThrow(SessionExpiredError)
    })

    it('throws Error with message from error response', async () => {
      const errorBody = { error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } }
      const mockResponse = new Response(JSON.stringify(errorBody), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
      mockFetch.mockResolvedValueOnce(mockResponse)

      await expect(fetchJsonWithAuth('/api/videos')).rejects.toThrow('Invalid input')
    })

    it('throws Error with status code when no error message', async () => {
      const mockResponse = new Response('{}', { status: 500 })
      mockFetch.mockResolvedValueOnce(mockResponse)

      await expect(fetchJsonWithAuth('/api/videos')).rejects.toThrow(
        'Request failed with status 500'
      )
    })

    it('handles non-JSON error response gracefully', async () => {
      const mockResponse = new Response('Internal Server Error', { status: 500 })
      mockFetch.mockResolvedValueOnce(mockResponse)

      await expect(fetchJsonWithAuth('/api/videos')).rejects.toThrow(
        'Request failed with status 500'
      )
    })
  })

  describe('SessionExpiredError', () => {
    it('has correct name and message', () => {
      const error = new SessionExpiredError()
      expect(error.name).toBe('SessionExpiredError')
      expect(error.message).toBe('Session expired')
    })

    it('is instance of Error', () => {
      const error = new SessionExpiredError()
      expect(error).toBeInstanceOf(Error)
    })
  })
})
