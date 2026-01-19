import Link from "next/link";

import { Badge } from "@/components/ui/badge";

interface TopicFilterProps {
  topics: string[];
  activeTopic?: string;
  baseUrl?: string;
}

/**
 * Displays topic filters as clickable badges.
 * Hides automatically when no topics are available.
 */
export function TopicFilter({
  topics,
  activeTopic,
  baseUrl = "/episodios",
}: TopicFilterProps) {
  if (topics.length === 0) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap gap-2"
      role="navigation"
      aria-label="Filtros por tópico"
    >
      <Link href={baseUrl}>
        <Badge
          variant={!activeTopic ? "default" : "outline"}
          className="cursor-pointer"
        >
          Todos
        </Badge>
      </Link>
      {topics.map((topic) => (
        <Link
          key={topic}
          href={`${baseUrl}?topic=${encodeURIComponent(topic)}`}
        >
          <Badge
            variant={activeTopic === topic ? "default" : "outline"}
            className="cursor-pointer"
          >
            {topic}
          </Badge>
        </Link>
      ))}
    </div>
  );
}
