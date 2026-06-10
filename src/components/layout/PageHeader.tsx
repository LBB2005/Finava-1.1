import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Tabs / lens pills, rendered between the mast and the right-side actions. */
  center?: ReactNode;
  /** Right-aligned controls. Convention: ChatContextButton first, page
      actions in the middle, the primary "ASK …" button last. */
  actions?: ReactNode;
  /** Optional full-width row under the main row (e.g. Watchlist KPI strip). */
  secondRow?: ReactNode;
  /** Soft scroll fade under the bar. On by default; invisible at rest. */
  fade?: boolean;
}

/** The one page top bar. Every top-level page renders this so titles,
    subtitles, gutters, and bar height (52px min) match exactly when
    switching pages. Dimensions live in globals.css (--page-* tokens). */
export default function PageHeader({ title, subtitle, center, actions, secondRow, fade = true }: PageHeaderProps) {
  return (
    <header className={"research-root page-header" + (fade ? " has-fade" : "")}>
      <div className="page-header-row">
        <div className="page-header-mast">
          <span className="serif page-title">{title}</span>
          {subtitle && <span className="mono page-subtitle">{subtitle}</span>}
        </div>
        {center}
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
      {secondRow && <div className="page-header-secondrow">{secondRow}</div>}
    </header>
  );
}
