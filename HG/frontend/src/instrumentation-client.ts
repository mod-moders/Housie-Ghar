/**
 * Browser-side observability (Next.js instrumentation-client convention).
 * Runs before hydration on every page load; no-op unless
 * NEXT_PUBLIC_SENTRY_DSN is configured at build time.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
