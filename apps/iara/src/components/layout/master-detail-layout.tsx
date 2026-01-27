'use client'

import type { ReactNode } from 'react'

import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'

interface MasterDetailLayoutProps {
  sidebar: ReactNode
  list: ReactNode
  detail: ReactNode
}

/**
 * Master-Detail layout with fixed sidebar and resizable list/detail panels.
 * Sidebar has fixed width, list and detail panels are resizable.
 */
export function MasterDetailLayout({ sidebar, list, detail }: MasterDetailLayoutProps) {
  return (
    <div className="flex h-screen">
      {/* Fixed Sidebar */}
      <div data-testid="sidebar-panel" className="shrink-0">
        {sidebar}
      </div>

      {/* Resizable List and Detail Panels */}
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId="video-layout"
        className="flex-1"
      >
        {/* Video List Panel */}
        <ResizablePanel
          defaultSize={40}
          minSize={25}
          data-testid="video-list-panel"
        >
          {list}
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Video Detail Panel */}
        <ResizablePanel
          defaultSize={60}
          minSize={30}
          data-testid="video-detail-panel"
        >
          {detail}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
