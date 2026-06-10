/** Which page a chat belongs to. `stock:<TICKER>` for a specific stock,
 *  or `null` for chats with no page context (legacy, or started on /chat). */
export type ChatContext = string | null;

/** Derive the chat context from the current route. Stock pages carry the
 *  ticker (pass it explicitly where available, else it's read from the path). */
export function contextFromPath(pathname: string, ticker?: string): ChatContext {
  if (pathname.startsWith("/research")) return "research";
  if (pathname.startsWith("/watchlist")) return "watchlist";
  if (pathname.startsWith("/portfolio")) return "portfolio";
  if (pathname.startsWith("/stock/")) {
    const t = (ticker ?? pathname.split("/")[2] ?? "").toUpperCase();
    return t ? `stock:${t}` : null;
  }
  return null;
}

/** Uppercase display label for the popover eyebrow. */
export function contextLabel(ctx: ChatContext): string {
  if (!ctx) return "ALL";
  if (ctx.startsWith("stock:")) return ctx.slice(6).toUpperCase();
  return ctx.toUpperCase();
}
