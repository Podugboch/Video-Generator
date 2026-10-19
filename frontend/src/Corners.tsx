// Four viewfinder brackets. Wrap in a `relative` parent.
export default function Corners() {
  const base = "pointer-events-none absolute h-4 w-4 border-ink";
  return (
    <>
      <span className={`${base} -left-2 -top-2 border-l-2 border-t-2`} />
      <span className={`${base} -right-2 -top-2 border-r-2 border-t-2`} />
      <span className={`${base} -bottom-2 -left-2 border-b-2 border-l-2`} />
      <span className={`${base} -bottom-2 -right-2 border-b-2 border-r-2`} />
    </>
  );
}
