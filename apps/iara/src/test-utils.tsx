import { render, RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'

function AllTheProviders({ children }: { children: ReactNode }) {
  return <div id="portal-root">{children}</div>
}

function customRender(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllTheProviders, ...options })
}

export * from '@testing-library/react'
export { customRender as render }
