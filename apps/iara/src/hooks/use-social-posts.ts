'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { log } from '@/lib/logger'
import type { SocialPost } from '@/types/social'

export interface EnabledNetworkInfo {
  id: string
  name: string
  icon: string
}

interface UseSocialPostsResult {
  posts: SocialPost[]
  isLoading: boolean
  isGenerating: boolean
  generatingNetworkId: string | null
  reprocessingNetworkId: string | null
  errors: Map<string, string>
  retryNetwork: (networkId: string) => void
  reprocessNetwork: (networkId: string, additionalContext?: string) => Promise<void>
  updatePost: (networkId: string, updatedPost: SocialPost) => void
}

export function useSocialPosts(
  videoId: string | null,
  enabledNetworks: EnabledNetworkInfo[],
  hasPrerequisites: boolean
): UseSocialPostsResult {
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingNetworkId, setGeneratingNetworkId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Map<string, string>>(new Map())
  const [reprocessingNetworkId, setReprocessingNetworkId] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Fetch existing posts
  const fetchPosts = useCallback(async (signal: AbortSignal): Promise<SocialPost[]> => {
    if (!videoId) return []
    const response = await fetch(`/api/videos/${videoId}/social-posts`, { signal })
    if (!response.ok) throw new Error('Falha ao carregar posts')
    const { data } = await response.json()
    return data
  }, [videoId])

  // Generate a single post
  const generatePost = useCallback(async (
    networkId: string,
    signal: AbortSignal
  ): Promise<SocialPost> => {
    const response = await fetch(
      `/api/videos/${videoId}/social-posts/${networkId}/generate`,
      { method: 'POST', signal }
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error?.message || 'Erro ao gerar post')
    }
    const { data } = await response.json()
    return data
  }, [videoId])

  // Main effect: fetch + auto-generate
  useEffect(() => {
    if (!videoId) {
      setPosts([])
      return
    }

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    const run = async () => {
      setIsLoading(true)
      setErrors(new Map())
      setIsGenerating(false)
      setGeneratingNetworkId(null)

      try {
        const existingPosts = await fetchPosts(controller.signal)
        if (controller.signal.aborted) return
        setPosts(existingPosts)
        setIsLoading(false)

        if (!hasPrerequisites) return

        // Identify missing networks
        const existingIds = new Set(existingPosts.map(p => p.networkId))
        const missingNetworks = enabledNetworks.filter(n => !existingIds.has(n.id))

        if (missingNetworks.length === 0) return

        // Sequential generation
        setIsGenerating(true)
        for (const network of missingNetworks) {
          if (controller.signal.aborted) return
          setGeneratingNetworkId(network.id)
          try {
            const newPost = await generatePost(network.id, controller.signal)
            if (controller.signal.aborted) return
            setPosts(prev => [...prev, newPost])
          } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') return
            setErrors(prev => new Map(prev).set(network.id, err instanceof Error ? err.message : 'Erro'))
          }
        }
        setIsGenerating(false)
        setGeneratingNetworkId(null)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        if (!controller.signal.aborted) {
          log('ERROR', 'Failed to load social posts', { videoId, error: err })
          setIsLoading(false)
        }
      }
    }

    run()
    return () => { controller.abort() }
  }, [videoId, enabledNetworks, hasPrerequisites, fetchPosts, generatePost])

  // Retry a specific network
  const retryNetwork = useCallback(async (networkId: string) => {
    if (!videoId) return
    // Use main abort ref so video change cancels retries too
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    // Clear error for this network
    setErrors(prev => {
      const next = new Map(prev)
      next.delete(networkId)
      return next
    })
    setGeneratingNetworkId(networkId)
    setIsGenerating(true)
    try {
      const newPost = await generatePost(networkId, controller.signal)
      setPosts(prev => [...prev, newPost])
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setErrors(prev => new Map(prev).set(networkId, err instanceof Error ? err.message : 'Erro'))
      }
    } finally {
      setIsGenerating(false)
      setGeneratingNetworkId(null)
    }
  }, [videoId, generatePost])

  // Reprocess a specific network with optional additionalContext
  // Errors are re-thrown for the caller (SocialPostColumn) to handle via local UI
  const reprocessNetwork = useCallback(async (networkId: string, additionalContext?: string) => {
    if (!videoId) return
    setReprocessingNetworkId(networkId)
    setErrors(prev => {
      const next = new Map(prev)
      next.delete(networkId)
      return next
    })
    try {
      const response = await fetch(
        `/api/videos/${videoId}/social-posts/${networkId}/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ additionalContext }),
          signal: abortControllerRef.current?.signal,
        }
      )
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error?.message || 'Erro ao reprocessar post')
      }
      const { data } = await response.json()
      setPosts(prev => prev.map(p => p.networkId === networkId ? data : p))
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      throw err
    } finally {
      setReprocessingNetworkId(null)
    }
  }, [videoId])

  // Update a post in the local state (after inline edit + save)
  const updatePost = useCallback((networkId: string, updatedPost: SocialPost) => {
    setPosts(prev => prev.map(p => p.networkId === networkId ? updatedPost : p))
  }, [])

  return {
    posts, isLoading, isGenerating, generatingNetworkId,
    reprocessingNetworkId, errors, retryNetwork, reprocessNetwork, updatePost,
  }
}
