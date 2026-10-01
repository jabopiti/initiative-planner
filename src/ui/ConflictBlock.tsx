import { useShowConflict, type FieldConflict } from '../state/ConflictUi';
import { Button } from '@/components/ui/button';
import { jumpTo } from './jumpTo';

/**
 * A same-field conflict, shown where the field is (§3, §9.9): both values as the field formats them and the two
 * choices, named after the field so two blocks on one screen are told apart (§9.5). While mounted, the banner
 * leaves this conflict out; when the banner's Show led here, the focus lands on Keep theirs.
 */
export function ConflictBlock({ conflict, label, className = '' }: { conflict: FieldConflict; label: string; className?: string }) {
  useShowConflict(conflict.key, conflict.id, jumpTo);
  return (
    <div id={conflict.id} role="alert" className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-warning-tint px-2 py-1 text-xs text-warning-text ${className}`}>
      <span>
        Changed by someone else while you were editing. Theirs: <strong className="font-medium">{conflict.theirs}</strong> · Yours:{' '}
        <strong className="font-medium">{conflict.mine}</strong>
      </span>
      <span className="flex gap-2">
        <Button type="button" variant="outline" size="xs" aria-label={`Keep theirs for ${label}`} onClick={() => conflict.choose('theirs')}>
          Keep theirs
        </Button>
        <Button type="button" variant="outline" size="xs" aria-label={`Use mine for ${label}`} onClick={() => conflict.choose('mine')}>
          Use mine
        </Button>
      </span>
      {conflict.failure && <span className="basis-full">{conflict.failure}</span>}
    </div>
  );
}

/** The block as a full-width table row under the field's own row (§9.9), so the table keeps its columns. */
export function ConflictRow({ conflict, label, colSpan }: { conflict: FieldConflict | null; label: string; colSpan: number }) {
  if (!conflict) return null;
  return (
    <tr>
      <td colSpan={colSpan} className="pr-2 pb-2">
        <ConflictBlock conflict={conflict} label={label} />
      </td>
    </tr>
  );
}

/** A field's conflict marked to show in a row under the table row rather than under the field. */
export const inRow = (conflict: FieldConflict | null): FieldConflict | null => (conflict ? { ...conflict, inRow: true } : null);
