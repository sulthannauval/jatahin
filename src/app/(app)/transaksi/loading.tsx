export default function Loading() {
  return (
    <div aria-busy="true">
      <div className="mb-5 flex justify-between"><div className="skeleton h-8 w-36" /><div className="skeleton h-11 w-64" /></div>
      <div className="skeleton mb-4 h-11" />
      <div className="mb-4 grid grid-cols-3 gap-2"><div className="skeleton h-14" /><div className="skeleton h-14" /><div className="skeleton h-14" /></div>
      <div className="skeleton h-80" />
    </div>
  );
}
