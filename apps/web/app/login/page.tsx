'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ErrorBanner } from '@proofline/ui';
import { ApiClientError, apiRequest, setCsrfToken, type SessionUser } from '../../lib/apiClient';

const LoginFormSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.')
});

type LoginFormValues = z.infer<typeof LoginFormSchema>;

interface DemoHintResponse {
  available: boolean;
  email?: string;
  password?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [authError, setAuthError] = useState<{ code?: string; message: string } | null>(null);
  const [demoHint, setDemoHint] = useState<{ email: string; password: string } | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: {
      email: '',
      password: ''
    }
  });

  useEffect(() => {
    let cancelled = false;
    apiRequest<DemoHintResponse>('/api/auth/demo-hint')
      .then((res) => {
        if (!cancelled && res.available && res.email && res.password) {
          setDemoHint({ email: res.email, password: res.password });
        }
      })
      .catch(() => {
        // Production / disabled DEMO_MODE: keep autofill hidden.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(values: LoginFormValues) {
    setAuthError(null);
    try {
      const res = await apiRequest<{ user: SessionUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(values)
      });
      setCsrfToken(res.user.csrfToken);
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setAuthError({ code: err.code, message: err.message });
      } else {
        setAuthError({ message: err instanceof Error ? err.message : 'Unable to sign in.' });
      }
    }
  }

  function fillDemoAccount() {
    if (!demoHint) return;
    form.setValue('email', demoHint.email);
    form.setValue('password', demoHint.password);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F6F2] px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="border-b border-[#DFDCD4] pb-4">
          <div className="flex items-center gap-2 text-[#1B3B6F]">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            <span className="text-base font-bold tracking-tight text-[#14181F]">PROOFLINE</span>
            <span className="ml-auto rounded-[3px] border border-[#C4D3EB] bg-[#EEF3FA] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#1B3B6F]">
              SANDBOX
            </span>
          </div>
          <p className="mt-2 text-xs text-[#4A5568]">
            Evidence you can trace. Disputes you can defend.
          </p>
        </div>

        <form
          onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
          className="rounded-[6px] border border-[#DFDCD4] bg-white p-6 space-y-4"
        >
          <div>
            <h1 className="text-base font-semibold text-[#14181F]">Merchant Operator Sign In</h1>
            <p className="mt-1 text-xs text-[#4A5568]">
              Workspace sessions use Argon2id verification, HttpOnly cookies, and CSRF validation.
            </p>
          </div>

          {authError ? (
            <ErrorBanner
              title="Authentication failed"
              code={authError.code}
              message={authError.message}
            />
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-xs font-medium text-[#14181F]">
              Operator Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...form.register('email')}
              className="w-full rounded-[4px] border border-[#C5C0B4] bg-white px-3 py-2 text-sm text-[#14181F] focus:border-[#1B3B6F] focus:outline-none"
            />
            {form.formState.errors.email ? (
              <p className="text-xs text-[#A82424]">{form.formState.errors.email.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-xs font-medium text-[#14181F]">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              {...form.register('password')}
              className="w-full rounded-[4px] border border-[#C5C0B4] bg-white px-3 py-2 text-sm text-[#14181F] focus:border-[#1B3B6F] focus:outline-none"
            />
            {form.formState.errors.password ? (
              <p className="text-xs text-[#A82424]">{form.formState.errors.password.message}</p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-[4px] bg-[#1B3B6F] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#142C54] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#1B3B6F]"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{form.formState.isSubmitting ? 'Verifying…' : 'Sign in to workspace'}</span>
          </button>

          {demoHint ? (
            <div className="border-t border-[#DFDCD4] pt-3 flex items-center justify-between text-[11.5px] text-[#4A5568]">
              <span>Local demo workspace credentials available</span>
              <button
                type="button"
                onClick={fillDemoAccount}
                className="font-medium text-[#1B3B6F] hover:underline"
              >
                Autofill demo login
              </button>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}

