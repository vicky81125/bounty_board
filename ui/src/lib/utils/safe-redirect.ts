/**
 * Validates a redirect path to prevent open redirect attacks.
 * - Must start with / (relative path)
 * - Must NOT start with // (protocol-relative URL)
 * - Must NOT contain :// (absolute URL)
 */
export function safeRedirect(
  next: string | null | undefined,
  fallback = '/'
): string {
  if (!next) return fallback
  if (
    next.startsWith('/') &&
    !next.startsWith('//') &&
    !next.includes('://')
  ) {
    return next
  }
  return fallback
}
