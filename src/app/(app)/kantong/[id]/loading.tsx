export default function Loading() {
  return (
    <div className="mx-auto max-w-[760px]" aria-busy="true" aria-label="Memuat">
      <div className="skeleton h-9 w-28" />
      <div className="mt-2 mb-6 flex justify-between"><div className="skeleton h-8 w-44" /><div className="skeleton h-8 w-20" /></div>
      <div className="skeleton h-[200px] rounded-lg" />
      <div className="skeleton mt-3 h-[320px] rounded-lg" />
    </div>
  );
}
