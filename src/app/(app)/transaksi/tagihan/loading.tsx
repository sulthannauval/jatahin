export default function Loading() {
  return (
    <div className="mx-auto max-w-[760px]" aria-busy="true" aria-label="Memuat">
      <div className="skeleton h-9 w-24" />
      <div className="mt-2 mb-6 skeleton h-8 w-36" />
      <div className="skeleton h-[120px] rounded-lg" />
      <div className="mt-3 skeleton h-[360px] rounded-lg" />
    </div>
  );
}
