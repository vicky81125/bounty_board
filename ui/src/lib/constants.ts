export const BOUNTY_TAGS = [
  "AI",
  "LLM",
  "Python",
  "Web Dev",
  "API",
  "Scrapers",
  "SEO",
  "Data Science",
  "Mobile",
  "DevOps",
  "NLP",
  "Computer Vision",
  "Automation",
  "Analytics",
] as const

export type BountyTag = (typeof BOUNTY_TAGS)[number]
