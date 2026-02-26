import Markdown from 'react-markdown'

interface AdwordsGuideDisplayProps {
  guide: string
}

export function AdwordsGuideDisplay({ guide }: AdwordsGuideDisplayProps) {
  return (
    <div
      data-testid="adwords-guide-display"
      className="overflow-y-auto custom-scrollbar text-sm leading-relaxed text-foreground"
    >
      <Markdown
        components={{
          h1: ({ children }) => <h1 className="text-lg font-bold mb-3 mt-4 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold mb-2 mt-3">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2">{children}</h3>,
          p: ({ children }) => <p className="mb-2">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-muted-foreground/30 pl-3 my-2 text-muted-foreground italic">{children}</blockquote>,
          a: ({ href, children }) => <a href={href} className="text-primary underline underline-offset-2" target="_blank" rel="noopener noreferrer">{children}</a>,
          hr: () => <hr className="my-3 border-border" />,
          code: ({ children }) => <code className="bg-muted px-1 py-0.5 rounded text-xs">{children}</code>,
        }}
      >
        {guide}
      </Markdown>
    </div>
  )
}
