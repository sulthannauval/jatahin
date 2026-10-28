export default function Loading() {
  return (
    <div className="mx-auto max-w-[760px]" aria-busy="true" aria-label="Memuat">
      <div className="mb-6 flex justify-between"><div className="skeleton h-8 w-44" /><div className="skeleton h-9 w-24" /></div>
      <div className="skeleton h-[300px] rounded-lg" />
      <div className="skeleton mt-10 h-6 w-40" />
      <div className="skeleton mt-3 h-[280px] rounded-lg" />
    </div>
  );
}
