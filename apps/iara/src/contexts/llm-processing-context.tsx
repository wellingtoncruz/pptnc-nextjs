'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface LLMProcessingContextValue {
  /** Indica se há uma chamada LLM em andamento */
  isProcessing: boolean
  /** Marca o início de uma chamada LLM */
  startProcessing: () => void
  /** Marca o fim de uma chamada LLM */
  stopProcessing: () => void
}

const LLMProcessingContext = createContext<LLMProcessingContextValue | null>(null)

interface LLMProcessingProviderProps {
  children: ReactNode
}

/**
 * Provider que gerencia o estado de processamento LLM.
 *
 * Usado para bloquear a troca de vídeo enquanto uma chamada LLM está em andamento.
 * O bloqueio é suave - não exibe mensagem de erro, apenas desabilita a seleção.
 */
export function LLMProcessingProvider({ children }: LLMProcessingProviderProps) {
  const [isProcessing, setIsProcessing] = useState(false)

  const startProcessing = useCallback(() => {
    setIsProcessing(true)
  }, [])

  const stopProcessing = useCallback(() => {
    setIsProcessing(false)
  }, [])

  return (
    <LLMProcessingContext.Provider value={{ isProcessing, startProcessing, stopProcessing }}>
      {children}
    </LLMProcessingContext.Provider>
  )
}

/**
 * Hook para acessar o estado de processamento LLM.
 *
 * @throws Se usado fora do LLMProcessingProvider
 */
export function useLLMProcessing(): LLMProcessingContextValue {
  const context = useContext(LLMProcessingContext)
  if (!context) {
    throw new Error('useLLMProcessing deve ser usado dentro de LLMProcessingProvider')
  }
  return context
}
