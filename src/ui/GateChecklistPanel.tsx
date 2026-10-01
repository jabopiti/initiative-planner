import { useId, useState } from 'react';
import type { PhaseDef } from '../brand/types';
import { gateProgress, gateProgressText, gateRequirements, type ChecklistItemView, type ChecklistRequirement } from '../data/gate';
import { useBrand } from '../state/BrandContext';
import { useIsChangedByOthers, useRepository } from '../state/DataContext';
import { isInitiativeFrozen } from '../data/frozen';
import { FILE_PATHS, type ChecklistStatus, type Initiative } from '../data/types';
import { Refusal } from './CommitInput';
import { CompleteIcon, IncompleteIcon, InfoIcon, TentativeIcon } from './icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const STATUS_LABEL: Record<ChecklistStatus, string> = { incomplete: 'Incomplete', tentative: 'Tentative', complete: 'Complete' };
const STATUS_ICON = { incomplete: IncompleteIcon, tentative: TentativeIcon, complete: CompleteIcon } satisfies Record<ChecklistStatus, unknown>;

/** The panel's row anchor, for the magic bar's "jump to the first open item" (§5.4). */
export const checklistItemAnchor = (writePhaseId: string, itemId: string) => `checklist-${writePhaseId}-${itemId}`;

/** A checklist requirement reshaped for the row component, which only needs the item's own fields, not the blocker-facing `state`/`text`. */
function toItemView(requirement: ChecklistRequirement): ChecklistItemView {
  return { id: requirement.itemId, name: requirement.name, description: requirement.description, status: requirement.status, note: requirement.note };
}

/** The current gate's checklist panel (§5.4, §8.1): the exit gate's requirements, read as "X of Y complete". */
export function GateChecklistPanel({ initiative, phase }: { initiative: Initiative; phase: PhaseDef }) {
  const { process } = useBrand();
  const requirements = gateRequirements(process, initiative, phase.id);
  const { complete, total } = gateProgress(requirements);
  const checklistRequirements = requirements.filter((r): r is ChecklistRequirement => r.kind === 'checklist');
  const items = checklistRequirements.filter((r) => !r.carried);
  const carried = checklistRequirements.filter((r) => r.carried);
  // Statuses freeze with a Closed or Cancelled initiative; notes don't (§8.4).
  const frozen = isInitiativeFrozen(initiative);

  if (items.length === 0 && carried.length === 0) return null;

  return (
    <section aria-labelledby="gate-checklist-heading" className="flex flex-col gap-3 rounded-lg border border-border-default bg-surface-card p-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="gate-checklist-heading" className="m-0 text-lg">
          Gate / Checklist — {phase.exitGate.label}
        </h2>
        <span className="text-sm text-text-secondary">{gateProgressText({ complete, total })}</span>
      </div>
      <ol className="m-0 flex list-none flex-col p-0">
        {items.map((item) => (
          <ChecklistItemRow key={item.itemId} item={toItemView(item)} initiativeId={initiative.id} writePhaseId={phase.id} frozen={frozen} />
        ))}
      </ol>
      {carried.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border-default pt-3">
          <h3 className="m-0 text-sm font-medium text-text-secondary">Carried forward</h3>
          <ol className="m-0 flex list-none flex-col p-0">
            {carried.map((item) => (
              <ChecklistItemRow
                key={item.itemId}
                item={toItemView(item)}
                initiativeId={initiative.id}
                writePhaseId={item.carried!.originPhaseId}
                originGateLabel={item.carried!.originGateLabel}
                frozen={frozen}
              />
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function ChecklistItemRow({
  item,
  initiativeId,
  writePhaseId,
  originGateLabel,
  frozen,
}: {
  item: ChecklistItemView;
  initiativeId: string;
  /** The phase whose gate defines this item: the current gate for its own items, the origin gate for a carried one (§8.1). */
  writePhaseId: string;
  originGateLabel?: string;
  /** The initiative is Closed or Cancelled: the status shows read-only, and only the note can be edited (§8.4). */
  frozen: boolean;
}) {
  const repository = useRepository();
  const changed = useIsChangedByOthers();
  const file = FILE_PATHS.initiative(initiativeId);
  const [editingNote, setEditingNote] = useState(false);
  const [draftNote, setDraftNote] = useState(item.note);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const noteErrorId = useId();

  const setStatus = (status: ChecklistStatus, note: string) => repository.setChecklistItem(initiativeId, writePhaseId, item.id, status, note);

  const startTentative = () => {
    setDraftNote(item.note);
    setRefused(null);
    setEditingNote(true);
  };
  const commitTentative = () => {
    const note = draftNote.trim();
    if (note === '') {
      setRefused('Enter a note.');
      return;
    }
    setStatus('tentative', note);
    setEditingNote(false);
    setRefused(null);
  };
  const startNote = () => {
    setDraftNote(item.note);
    setRefused(null);
    setEditingNote(true);
  };
  const commitNote = () => {
    if (!repository.setChecklistNote(initiativeId, writePhaseId, item.id, draftNote)) {
      setRefused('Enter a note.');
      return;
    }
    setEditingNote(false);
    setRefused(null);
  };
  const commit = frozen ? commitNote : commitTentative;
  const cancelTentative = () => {
    setEditingNote(false);
    setRefused(null);
  };

  return (
    <li id={checklistItemAnchor(writePhaseId, item.id)} className="flex flex-col gap-1 border-t border-border-default py-2 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1">
          <span className="text-sm">{item.name}</span>
          {originGateLabel && <span className="text-xs text-warning-text">carried from {originGateLabel}</span>}
          {item.description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="size-6" aria-label={`About "${item.name}"`} onClick={() => setDescriptionOpen((open) => !open)}>
                  <InfoIcon width={14} height={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{descriptionOpen ? 'Hide description' : 'Show description'}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className={`flex items-center gap-2 transition-colors duration-500 ${changed(file, ['checklist', writePhaseId, item.id]) ? 'rounded-md bg-met-tint' : ''}`}>
          {frozen ? (
            <>
              <FrozenStatusIcon status={item.status} />
              <span className="text-xs text-text-muted">{STATUS_LABEL[item.status]}</span>
              <span className="text-xs text-text-muted" aria-hidden="true">
                ·
              </span>
              <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" aria-label={`${item.note ? 'Edit' : 'Add'} note for "${item.name}"`} onClick={startNote}>
                {item.note ? 'Edit note' : 'Add note'}
              </Button>
            </>
          ) : (
            <>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={item.status}
                aria-label={`Status of "${item.name}"`}
                onValueChange={(next) => {
                  if (!next) return;
                  if (next === 'tentative') startTentative();
                  else {
                    cancelTentative();
                    setStatus(next as ChecklistStatus, item.note);
                  }
                }}
              >
                {(
                  [
                    ['incomplete', 'Incomplete', IncompleteIcon],
                    ['tentative', 'Tentative', TentativeIcon],
                    ['complete', 'Complete', CompleteIcon],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <Tooltip key={value}>
                    <TooltipTrigger asChild>
                      <ToggleGroupItem value={value} aria-label={label}>
                        <Icon width={16} height={16} />
                      </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                  </Tooltip>
                ))}
              </ToggleGroup>
              <span className="text-xs text-text-secondary">{STATUS_LABEL[item.status]}</span>
            </>
          )}
        </div>
      </div>
      {descriptionOpen && item.description && <p className="m-0 text-xs text-text-secondary">{item.description}</p>}
      {editingNote ? (
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex flex-col gap-1">
            <Input
              autoFocus
              aria-label={`Note for "${item.name}"`}
              className="w-72"
              value={draftNote}
              aria-invalid={refused ? true : undefined}
              aria-describedby={refused ? noteErrorId : undefined}
              onChange={(e) => setDraftNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  cancelTentative();
                }
              }}
            />
            {refused && <Refusal id={noteErrorId}>{refused}</Refusal>}
          </div>
          <Button type="button" size="sm" onClick={commit}>
            Save
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={cancelTentative}>
            Cancel
          </Button>
        </div>
      ) : (
        item.note && <p className="m-0 text-xs text-text-muted">{item.note}</p>
      )}
    </li>
  );
}

/** A frozen item's status, shown not set (§8.4): its icon, muted, beside the status named in text (§9.5). */
function FrozenStatusIcon({ status }: { status: ChecklistStatus }) {
  const Icon = STATUS_ICON[status];
  return <Icon width={16} height={16} className="text-text-muted" />;
}
