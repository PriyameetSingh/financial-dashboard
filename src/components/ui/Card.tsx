interface CardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

export default function Card({ title, subtitle, children, className }: CardProps) {
  return (
    <div className={`rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-6 shadow-sm ${className ?? ""}`}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <p className="text-sm font-semibold text-[var(--color-text)]">{title}</p>}
          {subtitle && <p className="text-[13px] text-[var(--ax-muted)]">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
