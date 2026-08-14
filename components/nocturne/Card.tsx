import type { ReactNode } from "react";

/**
 * A surface-filled content card, with the design system's four optional slots.
 *
 * `title` renders as a `div` rather than a heading by default: a card is not
 * automatically a document section, and emitting an `h3` per card is how a page
 * ends up with a heading outline that reads as noise. Pass `titleAs` when the
 * card genuinely is a section.
 *
 * `actions` is a slot rather than something a caller drops into `children`,
 * because `children` becomes `.card-body`, and `.card-body` is quieter than the
 * rest of the card by design. A button placed inside it inherits that quietness
 * — an accent outline button nested in a card body measured 3.54:1 against the
 * surface, failing AA purely because of where it sat. The slot puts it outside.
 */
export type CardElevation = "none" | "sm" | "md" | "lg";

const ELEVATION_CLASS: Record<CardElevation, string | null> = {
  none: null,
  sm: "elev-sm",
  md: "elev-md",
  lg: "elev-lg",
};

export type CardProps = {
  kicker?: ReactNode;
  title?: ReactNode;
  titleAs?: "div" | "h2" | "h3" | "h4";
  meta?: ReactNode;
  /** Buttons and links. Rendered outside the quieter body. */
  actions?: ReactNode;
  elevation?: CardElevation;
  className?: string;
  children?: ReactNode;
};

export default function Card({
  kicker,
  title,
  titleAs: TitleTag = "div",
  meta,
  actions,
  elevation = "none",
  className,
  children,
}: CardProps) {
  const cls = ["card", ELEVATION_CLASS[elevation], className].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      {kicker ? <div className="card-kicker">{kicker}</div> : null}
      {title ? <TitleTag className="card-title">{title}</TitleTag> : null}
      {children ? <div className="card-body">{children}</div> : null}
      {meta ? <div className="card-meta">{meta}</div> : null}
      {actions ? <div className="card-actions">{actions}</div> : null}
    </div>
  );
}
