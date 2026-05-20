/** Paths that should not emit inbound HTTP logs (SPA navigation, static assets, polling). */
export function shouldSkipInboundHttpLog(path: string): boolean {
  const p = (path.split('?')[0] ?? '').replace(/\/+$/, '') || '/';

  if (p.startsWith('/docs')) return true;
  if (p === '/admin/interface-data') return true;

  // Dashboard HTML shell and client-side routes (/interface/records/payments, …)
  if (p === '/' || p === '/interface' || p.startsWith('/interface/')) return true;

  return false;
}
