/** Shared route-level loading skeleton — Next.js renders this instantly on
 * navigation (via each route segment's `loading.tsx`) while the async Server
 * Component page fetches its data, so tab switches feel immediate instead of
 * blank/frozen. Generic block shapes, not tailored per-route (kept simple). */
export default function RouteLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 md:px-8 pt-4 pb-24 min-h-screen bg-[#F7F8FA] animate-pulse">
      <div className="h-9 w-9 bg-slate-200 rounded-full mb-1" />
      <div className="h-10 w-2/3 max-w-md bg-slate-200 rounded-lg" />
      <div className="h-4 w-1/3 max-w-xs bg-slate-200 rounded" />
      <div className="flex gap-2 overflow-hidden py-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-11 w-28 flex-shrink-0 bg-slate-200 rounded-2xl" />
        ))}
      </div>
      <div className="h-64 bg-white border border-slate-200 rounded-card shadow-raised" />
      <div className="h-48 bg-white border border-slate-200 rounded-card shadow-raised" />
      <div className="h-40 bg-white border border-slate-200 rounded-card shadow-raised" />
    </div>
  );
}
