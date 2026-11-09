'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  FileArchive,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Scale,
  Settings,
  ShieldCheck,
  X
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { cn, LoadingSkeleton, StatusBadge } from '@proofline/ui';
import { ApiClientError, apiRequest, fetchCurrentUser, setCsrfToken } from '../lib/apiClient';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/disputes', label: 'Disputes', icon: Scale },
  { href: '/evidence', label: 'Evidence Library', icon: FileArchive },
  { href: '/activity', label: 'Activity Ledger', icon: Activity },
  { href: '/demo', label: 'Guided Demo', icon: FlaskConical },
  { href: '/settings', label: 'Settings', icon: Settings }
] as const;

export function AppShell({
  title,
  subtitle,
  actions,
  children
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const userQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchCurrentUser,
    retry: false
  });

  useEffect(() => {
    if (userQuery.error instanceof ApiClientError && userQuery.error.statusCode === 401) {
      router.replace('/login');
    }
  }, [userQuery.error, router]);

  async function handleLogout() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // Clear local session state regardless of logout network response
    } finally {
      setCsrfToken(null);
      queryClient.clear();
      router.replace('/login');
    }
  }

  if (userQuery.isLoading) {
    return (
      <div className="min-h-screen bg-[#F7F6F2] p-8">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="h-8 w-48 rounded bg-[#EAE7DF]" />
          <LoadingSkeleton rows={6} />
        </div>
      </div>
    );
  }

  if (userQuery.isError || !userQuery.data) {
    return null;
  }

  const user = userQuery.data;

  const navContent = (
    <div className="flex h-full flex-col justify-between bg-[#F0EEE8] border-r border-[#DFDCD4]">
      <div>
        <div className="flex h-11 items-center gap-2 border-b border-[#DFDCD4] px-4">
          <ShieldCheck className="h-4 w-4 text-[#1B3B6F]" aria-hidden="true" />
          <span className="text-sm font-bold tracking-tight text-[#14181F]">PROOFLINE</span>
          <span className="ml-auto rounded-[3px] border border-[#C4D3EB] bg-[#EEF3FA] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#1B3B6F]">
            SANDBOX
          </span>
        </div>

        <nav aria-label="Primary navigation" className="p-2.5 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileNavOpen(false)}
                className={cn(
                  'flex items-center gap-2.5 rounded-[4px] px-3 py-2 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[#1B3B6F]',
                  active
                    ? 'bg-white text-[#1B3B6F] border border-[#DFDCD4]'
                    : 'text-[#4A5568] hover:bg-[#E7E4DC] hover:text-[#14181F] border border-transparent'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-[#DFDCD4] p-3 space-y-2.5 bg-[#ECE9E1]">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#6B7280]">
            Workspace
          </div>
          <div className="mt-0.5 text-xs font-semibold text-[#14181F] truncate">
            {user.workspaceName}
          </div>
          <div className="text-[11px] text-[#4A5568] truncate">{user.email}</div>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex w-full items-center justify-center gap-1.5 rounded-[4px] border border-[#C5C0B4] bg-white px-2.5 py-1.5 text-xs font-medium text-[#14181F] hover:bg-[#F7F6F2] focus-visible:outline-2 focus-visible:outline-[#1B3B6F]"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F7F6F2] text-[#14181F]">
      {/* Desktop Rail */}
      <aside className="hidden lg:flex lg:w-[232px] lg:shrink-0">
        <div className="w-full">{navContent}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-[#14181F]/35"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-[248px] max-w-[82vw] h-full shadow-lg">
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation"
              className="absolute right-2 top-2 rounded p-1.5 text-[#4A5568] hover:bg-white"
            >
              <X className="h-4 w-4" />
            </button>
            {navContent}
          </div>
        </div>
      ) : null}

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="flex h-11 items-center justify-between gap-3 border-b border-[#DFDCD4] bg-white px-4 lg:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              className="inline-flex lg:hidden items-center justify-center rounded-[4px] border border-[#DFDCD4] p-1.5 text-[#14181F] hover:bg-[#F7F6F2]"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#6B7280] hidden sm:inline">
              PayPal Sandbox Disputes Workspace
            </span>
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge label={`Role: ${user.role}`} tone="navy" />
          </div>
        </header>

        <main className="flex-1 mx-auto w-full max-w-[1440px] px-4 py-6 lg:px-6">
          <div className="mb-6 flex flex-col gap-3 border-b border-[#DFDCD4] pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-[20px] font-semibold tracking-tight text-[#14181F]">{title}</h1>
              {subtitle ? <p className="mt-1 text-xs text-[#4A5568]">{subtitle}</p> : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

