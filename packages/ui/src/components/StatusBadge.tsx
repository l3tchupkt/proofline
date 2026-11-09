import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileWarning,
  Info,
  XCircle
} from 'lucide-react';
import { cn } from '../utils.js';

export type BadgeTone = 'neutral' | 'navy' | 'verified' | 'warning' | 'danger';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-[#F0EEE8] text-[#4A5568] border-[#DFDCD4]',
  navy: 'bg-[#EEF3FA] text-[#1B3B6F] border-[#C4D3EB]',
  verified: 'bg-[#EAF6EF] text-[#156F48] border-[#BBE2CC]',
  warning: 'bg-[#FEF5E4] text-[#9A5B06] border-[#F3D7A2]',
  danger: 'bg-[#FDECEC] text-[#A82424] border-[#F5C2C2]'
};

const TONE_ICON = {
  neutral: Info,
  navy: CheckCircle2,
  verified: CheckCircle2,
  warning: Clock,
  danger: XCircle
};

export interface StatusBadgeProps {
  label: string;
  tone?: BadgeTone;
  icon?: 'default' | 'alert' | 'warning';
  className?: string;
}

export function StatusBadge({
  label,
  tone = 'neutral',
  icon = 'default',
  className
}: StatusBadgeProps) {
  const Icon =
    icon === 'alert'
      ? AlertTriangle
      : icon === 'warning'
        ? FileWarning
        : TONE_ICON[tone];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase whitespace-nowrap',
        TONE_CLASSES[tone],
        className
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function getDisputeStatusTone(status: string): BadgeTone {
  switch (status.toUpperCase()) {
    case 'WAITING_FOR_SELLER_RESPONSE':
      return 'warning';
    case 'RESOLVED':
      return 'verified';
    case 'UNDER_REVIEW':
    case 'OPEN':
      return 'navy';
    default:
      return 'neutral';
  }
}

export function getSubmissionStatusTone(status: string): BadgeTone {
  switch (status.toUpperCase()) {
    case 'VERIFIED':
      return 'verified';
    case 'APPROVED':
    case 'SUBMITTED':
      return 'navy';
    case 'AWAITING_APPROVAL':
    case 'VERIFICATION_PENDING':
    case 'SUBMITTING':
      return 'warning';
    case 'FAILED':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function getVerificationTone(status: string): BadgeTone {
  switch (status.toUpperCase()) {
    case 'VERIFIED':
    case 'PROCESSED':
      return 'verified';
    case 'REQUIRES_REVIEW':
    case 'NEEDS_REVIEW':
    case 'PROCESSING':
      return 'warning';
    case 'CONFLICTING':
    case 'UNSUPPORTED':
    case 'FAILED':
      return 'danger';
    default:
      return 'neutral';
  }
}

