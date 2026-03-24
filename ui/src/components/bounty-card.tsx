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
  easy: "bg-green-100 text-green-800",
  medium: "bg-amber-100 text-amber-800",
  hard: "bg-red-100 text-red-800",
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
      className="block rounded-lg border bg-card hover:border-primary/50 transition-colors p-5 space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-sm leading-snug line-clamp-2">{title}</h3>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize",
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
              className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {prizeSummary && <span className="font-medium text-foreground">{prizeSummary}</span>}
          {deadline && (
            <span className={deadline === "Ended" ? "text-destructive" : ""}>
              {deadline}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span>{submissionCount !== null ? `${submissionCount} submissions` : "—"}</span>
          {status === "closed" && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Closed</span>
          )}
        </div>
      </div>
    </Link>
  )
}
