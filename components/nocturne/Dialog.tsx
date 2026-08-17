import type { ReactNode } from "react";

/**
 * The dialog surface — title, body, actions — with no modal behaviour.
 *
 * Split out from `Modal` deliberately. The surface is presentational and
 * server-renderable; the modal behaviour (focus trap, inert background, Escape
 * to close) is a browser concern that belongs in a client component. Keeping
 * them apart means a page that only needs the look — a confirmation preview, a
 * gallery specimen, a screenshot in documentation — does not drag modal
 * semantics into markup that is not actually modal, which would announce a
 * dialog to a screen reader user who cannot leave it because it was never
 * opened.
 *
 * `titleId` is required so the wrapping `Modal` can point
 * `aria-labelledby` at it.
 */
export type DialogSurfaceProps = {
  titleId: string;
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export default function DialogSurface({
  titleId,
  title,
  children,
  actions,
  className,
}: DialogSurfaceProps) {
  return (
    <div className={["dialog", className].filter(Boolean).join(" ")}>
      <div className="dialog-title" id={titleId}>
        {title}
      </div>
      <div className="dialog-body">{children}</div>
      {actions ? <div className="dialog-actions">{actions}</div> : null}
    </div>
  );
}
