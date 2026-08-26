// Shared client⇄server types for the Screen lens. Pure types, no runtime deps
// on server-only modules so both sides can import freely.

// ── Screen commentary ────────────────────────────────────────────────────────
export interface ScreenCommentary {
  commentary: string; // what the basket has in common
  standout: string; // the single most interesting name + why
  watchout: string; // the main risk / caveat for the group
}

export interface SuggestedScreen {
  label: string; // short chip label
  rationale: string; // one line on why it's timely
  query: string; // NL query that runs when clicked
}
