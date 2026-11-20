export default function Loading() {
  return (
    <div className="mx-auto max-w-xl" aria-busy="true" aria-label="Memuat">
      <div className="skeleton mb-2 h-8 w-44" />
      <div className="skeleton mb-5 h-5 w-64" />
      <div className="skeleton h-[320px] rounded-2xl" />
    </div>
  );
}
