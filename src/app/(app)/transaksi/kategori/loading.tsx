export default function Loading() {
  return (
    <div className="mx-auto max-w-[760px]" aria-busy="true" aria-label="Memuat">
      <div className="skeleton h-9 w-24" />
      <div className="mt-2 mb-6 skeleton h-8 w-36" />
      <div className="grid gap-3 md:grid-cols-2"><div className="skeleton h-[420px] rounded-lg" /><div className="skeleton h-[220px] rounded-lg" /></div>
    </div>
  );
}
