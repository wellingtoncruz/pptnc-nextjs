/**
 * Shared Markdown component overrides for newsletter phases.
 * Used by both NewsletterDraftPhase and NewsletterReportPhase.
 */
export const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => <h1 className="text-lg font-bold mb-3 mt-4 first:mt-0">{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="text-base font-semibold mb-2 mt-3">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="text-sm font-semibold mb-1 mt-2">{children}</h3>,
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
  blockquote: ({ children }: { children?: React.ReactNode }) => <blockquote className="border-l-2 border-muted-foreground/30 pl-3 my-2 text-muted-foreground italic">{children}</blockquote>,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => <a href={href} className="text-primary underline underline-offset-2" target="_blank" rel="noopener noreferrer">{children}</a>,
  hr: () => <hr className="my-3 border-border" />,
  pre: ({ children }: { children?: React.ReactNode }) => <pre className="bg-muted rounded-md p-3 my-2 overflow-x-auto custom-scrollbar text-xs">{children}</pre>,
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    // Fenced code blocks (inside <pre>) have className from react-markdown
    if (className) return <code className="text-xs">{children}</code>
    return <code className="bg-muted px-1 py-0.5 rounded text-xs">{children}</code>
  },
}
