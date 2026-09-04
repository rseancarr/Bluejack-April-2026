export function PageHeader({ title, subtitle, children }: { title: React.ReactNode; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5">
      <div>
        <h1>{title}</h1>
        {subtitle && <div className="muted mt-0.5">{subtitle}</div>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
