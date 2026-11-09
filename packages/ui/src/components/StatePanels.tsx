import { AlertTriangle, FileSearch, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../utils.js';

export function MonoId({
  value,
  truncateChars,
  className
}: {
  value: string;
  truncateChars?: number;
  className?: string;
}) {
  const display =
    truncateChars && value.length > truncateChars
      ? `${value.slice(0, truncateChars)}…`
      : value;

  return (
    <code
      title={value}
      className={cn(
        'font-mono text-[12px] tabular-nums text-[#14181F] bg-[#F0EEE8] px-1.5 py-0.5 rounded-[3px] border border-[#DFDCD4]',
        className
      )}
    >
      {display}
    </code>
  );
}

export function DemoOriginBanner({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-2.5 rounded-[4px] border border-[#F3D7A2] bg-[#FEF5E4] px-3.5 py-2 text-xs font-medium text-[#9A5B06]',
        className
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        <strong className="font-semibold tracking-wide">DEMO DATA — NOT A LIVE CUSTOMER RECORD.</strong>{' '}
        Simulated records are isolated from PayPal Sandbox disputes and cannot submit to PayPal.
      </span>
    </div>
  );
}

export function ErrorBanner({
  title,
  message,
  code,
  action,
  className
}: {
  title: string;
  message: string;
  code?: string | null;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-[4px] border border-[#F5C2C2] bg-[#FDECEC] px-4 py-3 text-sm text-[#A82424]',
        className
      )}
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <div className="font-semibold flex items-center gap-2">
            <span>{title}</span>
            {code ? (
              <code className="font-mono text-[11px] bg-white/70 px-1.5 py-0.5 rounded border border-[#F5C2C2]">
                {code}
              </code>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-[#7F1D1D]">{message}</p>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[6px] border border-dashed border-[#C5C0B4] bg-white px-6 py-10 text-center',
        className
      )}
    >
      <FileSearch className="h-7 w-7 text-[#6B7280] mb-2.5" aria-hidden="true" />
      <h3 className="text-sm font-semibold text-[#14181F]">{title}</h3>
      <p className="mt-1 max-w-md text-xs text-[#4A5568] leading-relaxed">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function LoadingSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2.5 animate-pulse', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 rounded-[4px] border border-[#DFDCD4] bg-[#F0EEE8]"
        />
      ))}
    </div>
  );
}

