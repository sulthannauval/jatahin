export default function Loading() {
  return (
    <div className="mx-auto max-w-[960px]" aria-busy="true" aria-label="Memuat">
      <div className="mb-6 flex justify-between"><div><div className="skeleton h-8 w-60" /><div className="skeleton mt-2 h-4 w-48" /></div><div className="skeleton h-10 w-24" /></div>
      <div className="skeleton h-[124px] rounded-2xl" />
      <div className="mt-8 grid gap-3 sm:grid-cols-3"><div className="skeleton h-40 rounded-2xl" /><div className="skeleton h-40 rounded-2xl" /><div className="skeleton h-40 rounded-2xl" /></div>
      <div className="skeleton mt-8 h-80 rounded-2xl" />
    </div>
  );
}
