/** A route that exists (§10.6 requires it) but whose screen isn't built by this slice yet. */
export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="p-8 text-text-secondary">
      <h1 className="text-xl text-text-primary">{title}</h1>
      <p>{note}</p>
    </div>
  );
}
