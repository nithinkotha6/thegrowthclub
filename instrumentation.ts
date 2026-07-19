/**
 * Next.js instrumentation hook — runs once when the server process starts.
 *
 * Fix for "TypeError: fetch failed" against Supabase (and other remote
 * hosts) on networks where outbound IPv6 is broken/blocked: Node's fetch
 * (undici) tries IPv6 first by default (Happy Eyeballs), then times out
 * and falls back to IPv4 — which shows up as a ~5-10s hang before the
 * error. Forcing IPv4-first DNS resolution avoids that hang entirely.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const dns = await import('dns');
    dns.setDefaultResultOrder('ipv4first');
  }
}
