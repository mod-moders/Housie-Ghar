/**
 * Server-side observability (Next.js instrumentation convention).
 * No-op unless a Sentry DSN is configured — set SENTRY_DSN (and
 * NEXT_PUBLIC_SENTRY_DSN for the browser) in the host's env to activate.
 */

import * as Sentry from '@sentry/nextjs';

export function register(): void {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}

export const onRequestError = Sentry.captureRequestError;
