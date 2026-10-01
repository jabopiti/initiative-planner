import { useBrand } from '../state/BrandContext';
import { chooseConflict, conflictBlockId, conflictKey, useConflictUi } from '../state/ConflictUi';
import { useRepository, useRepositoryState } from '../state/DataContext';
import { causeText } from '../github/errors';
import type { FileConflict } from '../sync/FileWriter';
import { navigate } from '../router/useHashRoute';
import { Button } from '@/components/ui/button';
import { conflictHome } from './conflictHome';
import { describeConflict } from './describeConflict';

/**
 * Same-field conflicts not shown where their field is (§3 "Conflict edge cases", §9.9, §10.5): never
 * auto-resolved. A conflict whose text field is on screen shows under it instead (`ConflictBlock`), and isn't
 * here. One whose field is elsewhere (a collapsed phase, another page, a closed panel) gets one line per thing,
 * "1 unresolved change on Checkout Redesign — Show", where Show goes to it. One no text field can show (a select,
 * a toggle, a list item removed on one side and changed on the other) is resolved here, one row per field,
 * naming the thing and both values as the screen shows them. A conflict leaves only once the choice is saved; if
 * the write fails it stays, with the cause, and choosing again is the retry.
 */
export function ConflictBanner() {
  const repository = useRepository();
  const brand = useBrand();
  const state = useRepositoryState();
  const { conflicts, readOnly } = state;
  const { store, shown, failed } = useConflictUi();

  const context = { ...state, process: brand.process, currencySymbol: brand.currencySymbol };
  const pointers = new Map<string, { entity: string; route: string; conflicts: FileConflict[] }>();
  const rows: FileConflict[] = [];
  for (const conflict of conflicts) {
    const route = conflictHome(conflict.file, conflict.path, state);
    if (route === null) {
      rows.push(conflict);
      continue;
    }
    if (shown.has(conflictKey(conflict.file, conflict.path))) continue;
    const { entity } = describeConflict(conflict, context);
    const group = `${route}|${entity}`;
    const pointer = pointers.get(group) ?? { entity, route, conflicts: [] };
    pointer.conflicts.push(conflict);
    pointers.set(group, pointer);
  }
  if (pointers.size === 0 && rows.length === 0) return null;

  const show = (route: string, conflict: FileConflict) => {
    store.reveal({ file: conflict.file, path: conflict.path, id: conflictBlockId(conflict.file, conflict.path) });
    navigate(route);
  };

  return (
    <div
      className="flex flex-col gap-1 border-b border-border-default bg-warning-tint px-4 py-2 text-sm text-warning-text"
      role="alert"
    >
      {[...pointers.values()].map(({ entity, route, conflicts: some }) => {
        const changes = `${some.length} unresolved ${some.length === 1 ? 'change' : 'changes'}`;
        return (
          <p key={`${route}|${entity}`} className="m-0">
            {changes} on <strong className="font-medium">{entity}</strong> —{' '}
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 font-medium text-inherit underline"
              aria-label={`Show ${changes} on ${entity}`}
              onClick={() => show(route, some[0])}
            >
              Show
            </button>
          </p>
        );
      })}
      {rows.length > 0 && (
        <div className={`flex flex-col gap-1 ${pointers.size > 0 ? 'mt-1 border-t border-border-default pt-1' : ''}`}>
          <p className="m-0">Changed by someone else while you were editing. Choose which value to keep.</p>
          {rows.map((conflict) => {
            const { entity, field, mine, theirs, labelled } = describeConflict(conflict, context);
            return (
              <div key={conflictKey(conflict.file, conflict.path)} className="border-t border-border-default pt-1">
                <div className="flex items-center justify-between gap-3">
                  <span>
                    <strong>{entity}</strong> · {field}
                    {!labelled && <span className="text-text-secondary"> (unlabelled field)</span>} — yours <strong>{mine}</strong>, theirs{' '}
                    <strong>{theirs}</strong>
                  </span>
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => void chooseConflict(repository, store, conflict, 'theirs')}>
                      Keep theirs
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void chooseConflict(repository, store, conflict, 'mine')}>
                      Use mine
                    </Button>
                  </div>
                </div>
                {failed.has(conflict) && (
                  <p className="mt-1 mb-0">
                    Your choice was not saved{readOnly ? `: ${causeText(readOnly)}` : ''}. Choose again to retry.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
