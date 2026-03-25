import Link from "next/link"
import { cn } from "@/lib/utils"

interface BountyCardProps {
  id: string
  title: string
  orgName: string
  prizeSummary?: string | null
  difficulty: "easy" | "medium" | "hard"
  tags: string[]
  status: "open" | "closed"
  endDate?: string | null
  submissionCount: number | null
}

const difficultyStyles: Record<string, string> = {
  easy: "bg-black/5 text-black/70",
  medium: "bg-black/10 text-black/80",
  hard: "bg-black/20 text-black/90",
}

function deadlineLabel(endDate: string | null | undefined): string | null {
  if (!endDate) return null
  const diff = new Date(endDate).getTime() - Date.now()
  if (diff <= 0) return "Ended"
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  return `${days}d left`
}

export function BountyCard({
  id,
  title,
  orgName,
  prizeSummary,
  difficulty,
  tags,
  status,
  endDate,
  submissionCount,
}: BountyCardProps) {
  const deadline = deadlineLabel(endDate)

  return (
    <Link
      href={`/bounties/${id}`}
      className="block rounded-xl border bg-card hover:shadow-md hover:border-border/80 transition-all p-5 space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-bold text-base leading-snug line-clamp-2">{title}</h3>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
            difficultyStyles[difficulty] ?? "bg-muted text-muted-foreground"
          )}
        >
          {difficulty}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">{orgName}</p>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border px-2.5 py-0.5 text-xs"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {prizeSummary && <span className="text-lg font-bold text-foreground">{prizeSummary}</span>}
          {deadline && (
            <span className={deadline === "Ended" ? "text-destructive" : ""}>
              {deadline}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span>{submissionCount !== null ? `${submissionCount} submissions` : "—"}</span>
          {status === "closed" && (
            <span className="rounded-full bg-black text-white text-xs px-2.5 py-0.5 font-medium">Closed</span>
          )}
        </div>
      </div>
    </Link>
  )
}
