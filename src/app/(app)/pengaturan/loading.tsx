export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Memuat">
      <div className="mb-6"><div className="skeleton h-8 w-40" /><div className="skeleton mt-2 h-4 w-80" /></div>
      <div className="grid gap-10 lg:grid-cols-[340px_1fr]"><div className="skeleton h-16" /><div className="skeleton h-96" /></div>
    </div>
  );
}
