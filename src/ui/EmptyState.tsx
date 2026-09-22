import styles from './EmptyState.module.css';

/** One line and one primary action (§9.4) — no illustrations, no tour. */
export function EmptyState({ line, actionLabel, onAction }: { line: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className={styles.wrap}>
      <p className={styles.line}>{line}</p>
      <button type="button" className={styles.action} onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}
