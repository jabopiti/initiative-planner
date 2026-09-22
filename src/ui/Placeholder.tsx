import styles from './Placeholder.module.css';

/** A route that exists (§10.6 requires it) but whose screen isn't built by this slice yet. */
export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className={styles.page}>
      <h1>{title}</h1>
      <p>{note}</p>
    </div>
  );
}
