"use client";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { signIn, loading, betaDenied } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-[var(--color-accent)] flex items-center justify-center shadow-sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <span className="text-xl font-bold text-[var(--color-text)] tracking-tight">Finava</span>
        </div>

        {/* Card */}
        <div className="bg-white border border-[var(--color-border)] rounded-2xl shadow-sm px-8 py-8">
          <h1 className="text-lg font-semibold text-[var(--color-text)] text-center mb-1">
            Welcome back
          </h1>
          <p className="text-sm text-[var(--color-muted)] text-center mb-7">
            Sign in to your AI research platform
          </p>

          {betaDenied && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
              Finava is in private beta. Your account isn&apos;t on the list yet —
              join the waitlist and we&apos;ll be in touch.
            </div>
          )}

          <button
            onClick={signIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white hover:bg-[var(--color-sidebar)] text-sm font-medium text-[var(--color-text)] transition-colors duration-150 shadow-sm disabled:opacity-50"
          >
            {/* Google icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        </div>

        <p className="text-center text-xs text-[var(--color-muted)] mt-6">
          By continuing, you confirm you are 18 or older and agree to our{" "}
          <a href="/terms" className="underline hover:text-[var(--color-text)]">Terms of Service</a> and{" "}
          <a href="/privacy" className="underline hover:text-[var(--color-text)]">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
