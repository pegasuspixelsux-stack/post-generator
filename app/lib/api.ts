// The backend origin (protocol + host only, no path). Locally that's the
// standalone uvicorn server; in production this app and the backend share
// one domain via Vercel Services, so requests should stay relative (empty
// origin) unless NEXT_PUBLIC_API_ORIGIN overrides it explicitly.
export const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_ORIGIN ?? (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8080' : '');

// Every backend route lives under this prefix — see backend/app/main.py and
// the top-level rewrite in vercel.json that routes it there. The service
// receives the full, unstripped path, so this prefix has to be baked into
// every request, not just the routing rule.
export const API_PREFIX = '/api/backend';

/** Build a full backend URL for a path like "/fonts" or "/generate-graphic". */
export function apiUrl(path: string): string {
  return `${API_ORIGIN}${API_PREFIX}${path}`;
}

/**
 * Resolve an asset URL returned by /assets. In production these are
 * absolute Vercel Blob URLs (a different domain entirely) and must be used
 * as-is; in local dev they're paths relative to the backend origin.
 */
export function resolveAssetUrl(url: string): string {
  return /^https?:\/\//.test(url) ? url : `${API_ORIGIN}${url}`;
}
