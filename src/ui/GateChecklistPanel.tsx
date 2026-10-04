import { useId, useState } from 'react';
import type { PhaseDef } from '../brand/types';
import { gateProgress, gateProgressText, gateRequirements, type ChecklistItemView, type ChecklistRequirement, type EstimatesRequirement } from '../data/gate';
import { useBrand } from '../state/BrandContext';
import { useIsChangedByOthers, useRepository } from '../state/DataContext';
import { isInitiativeFrozen } from '../data/frozen';
import { FILE_PATHS, type ChecklistStatus, type Initiative } from '../data/types';
import { Refusal } from './CommitInput';
import { requirementJump, useJump } from './jumpTo';
import { CompleteIcon, IncompleteIcon, InfoIcon, TentativeIcon } from './icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cardClass } from './cardClass';

const STATUS_LABEL: Record<ChecklistStatus, string> = { incomplete: 'Incomplete', tentative: 'Tentative', complete: 'Complete' };
const STATUS_ICON: Record<ChecklistStatus, typeof IncompleteIcon> = { incomplete: IncompleteIcon, tentative: TentativeIcon, complete: CompleteIcon };
/** Each status's colour role (§9.8): the icon at the row's left, and the selected segment's tint. */
const STATUS_ICON_CLASS: Record<ChecklistStatus, string> = { incomplete: 'text-text-secondary', tentative: 'text-warning-text', complete: 'text-met-text' };
const STATUS_SEGMENT_CLASS: Record<ChecklistStatus, string> = {
  incomplete: 'data-[state=on]:bg-surface-subtle data-[state=on]:text-text-primary',
  tentative: 'data-[state=on]:bg-warning-tint data-[state=on]:text-warning-text',
  complete: 'data-[state=on]:bg-met-tint data-[state=on]:text-met-text',
};
const STATUSES: ChecklistStatus[] = ['incomplete', 'tentative', 'complete'];

/** The panel's row anchor, for the magic bar's "jump to the first open item" (§5.4). */
export const checklistItemAnchor = (writePhaseId: string, itemId: string) => `checklist-${writePhaseId}-${itemId}`;

/** A checklist requirement reshaped for the row component, which only needs the item's own fields, not the blocker-facing `state`/`text`. */
function toItemView(requirement: ChecklistRequirement): ChecklistItemView {
  return { id: requirement.itemId, name: requirement.name, description: requirement.description, status: requirement.status, note: requirement.note };
}

/** The current gate's checklist panel (§5.4, §8.1): one row per requirement of the exit gate, read as "X of Y complete" — the estimates requirement first, then the checklist. */
export function GateChecklistPanel({ initiative, phase }: { initiative: Initiative; phase: PhaseDef }) {
  const { process } = useBrand();
  const requirements = gateRequirements(process, initiative, phase.id);
  const { complete, total } = gateProgress(requirements);
  const estimates = requirements.find((r): r is EstimatesRequirement => r.kind === 'estimates');
  const checklistRequirements = requirements.filter((r): r is ChecklistRequirement => r.kind === 'checklist');
  const items = checklistRequirements.filter((r) => !r.carried);
  const carried = checklistRequirements.filter((r) => r.carried);
  // Statuses freeze with a Closed or Cancelled initiative; notes don't (§8.4).
  const frozen = isInitiativeFrozen(initiative);

  if (requirements.length === 0) return null;

  return (
    <section aria-labelledby="gate-checklist-heading" className={`${cardClass} flex flex-col gap-3 p-3`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="gate-checklist-heading" className="m-0 text-title">
          Gate / Checklist — {phase.exitGate.label}
        </h2>
        <span className="text-caption text-text-secondary">{gateProgressText({ complete, total })}</span>
      </div>
      <ol className="m-0 flex list-none flex-col p-0">
        {estimates && <EstimatesRow requirement={estimates} phaseId={phase.id} />}
        {items.map((item) => (
          <ChecklistItemRow key={item.itemId} item={toItemView(item)} initiativeId={initiative.id} writePhaseId={phase.id} frozen={frozen} />
        ))}
      </ol>
      {carried.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border-default pt-3">
          <h3 className="m-0 text-label font-medium text-text-secondary">Carried forward</h3>
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

/** The estimates requirement as a row (§5.4, §8.1): a statement whose icon and Open / Met carry the state, with Go to <phase> while open. */
function EstimatesRow({ requirement, phaseId }: { requirement: EstimatesRequirement; phaseId: string }) {
  const { process } = useBrand();
  const jump = useJump();
  const met = requirement.state === 'met';
  const Icon = met ? CompleteIcon : IncompleteIcon;
  const target = process.find((p) => p.id === requirement.missingPhaseIds[0]);
  return (
    <li className="flex items-start justify-between gap-3 border-t border-border-default py-2 first:border-t-0">
      <div className="flex items-start gap-2">
        <Icon width={16} height={16} className={`mt-0.5 shrink-0 ${met ? 'text-met-text' : 'text-text-secondary'}`} />
        <span className="text-body">{requirement.label}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {target && (
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => jump(requirementJump(requirement, phaseId))}>
            Go to {target.label}
          </Button>
        )}
        <span className="text-caption text-text-secondary">{met ? 'Met' : 'Open'}</span>
      </div>
    </li>
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
  // The open note editor's save, fixed when it opens: a note opened on a frozen page stays a note-only save after a Reopen (§8.4).
  const [noteEditor, setNoteEditor] = useState<'note-only' | 'tentative' | null>(null);
  const [draftNote, setDraftNote] = useState(item.note);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const noteErrorId = useId();
  const noteInputId = useId();
  const StatusIcon = STATUS_ICON[item.status];

  const setStatus = (status: ChecklistStatus, note: string) => repository.setChecklistItem(initiativeId, writePhaseId, item.id, status, note);

  const startNote = () => {
    setDraftNote(item.note);
    setRefused(null);
    setNoteEditor(frozen ? 'note-only' : 'tentative');
  };
  // A frozen initiative saves the note alone, keeping the status (§8.4); otherwise saving the note sets Tentative.
  // Frozen since the editor opened (a pulled Cancel) also saves the note alone, rather than losing it to a refused status.
  const commit = () => {
    const note = draftNote.trim();
    const noteOnly = noteEditor === 'note-only' || frozen;
    if (noteOnly ? !repository.setChecklistNote(initiativeId, writePhaseId, item.id, note) : note === '') {
      setRefused('Enter a note.');
      return;
    }
    if (!noteOnly) setStatus('tentative', note);
    setNoteEditor(null);
    setRefused(null);
  };
  const cancelNote = () => {
    setNoteEditor(null);
    setRefused(null);
  };

  return (
    <li id={checklistItemAnchor(writePhaseId, item.id)} className="flex flex-col gap-1 border-t border-border-default py-2 first:border-t-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {/* The status icon at the left, in its colour role (§5.4, §9.8); the segmented control or the label names it. */}
          <StatusIcon width={16} height={16} aria-hidden="true" className={`shrink-0 ${frozen ? 'text-text-muted' : STATUS_ICON_CLASS[item.status]}`} />
          <span className={`text-body ${frozen ? 'text-text-secondary' : ''}`}>{item.name}</span>
          {originGateLabel && <span className="text-caption text-warning-text">carried from {originGateLabel}</span>}
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
        <div className={`flex shrink-0 items-center gap-2 transition-colors duration-500 motion-reduce:transition-none ${changed(file, ['checklist', writePhaseId, item.id]) ? 'rounded-md bg-met-tint' : ''}`}>
          {frozen ? (
            <>
              <span className="text-caption text-text-muted">{STATUS_LABEL[item.status]}</span>
              <span className="text-caption text-text-muted" aria-hidden="true">
                ·
              </span>
              <Button type="button" variant="link" size="sm" className="h-auto p-0 text-caption" aria-label={`${item.note ? 'Edit' : 'Add'} note for "${item.name}"`} onClick={startNote}>
                {item.note ? 'Edit note' : 'Add note'}
              </Button>
            </>
          ) : (
            // A labelled segmented control (§5.4): the selected segment tinted in its role; Tentative shows selected while its note is open.
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              // Radix gives the single-choice segments radio semantics but leaves the root a bare div; name it as their group.
              role="radiogroup"
              value={noteEditor === 'tentative' ? 'tentative' : item.status}
              aria-label={`Status of "${item.name}"`}
              onValueChange={(next) => {
                if (!next) return;
                if (next === 'tentative') startNote();
                else {
                  cancelNote();
                  setStatus(next as ChecklistStatus, item.note);
                }
              }}
            >
              {STATUSES.map((value) => (
                <ToggleGroupItem key={value} value={value} className={`px-2.5 text-caption font-normal text-text-secondary data-[state=on]:font-medium ${STATUS_SEGMENT_CLASS[value]}`}>
                  {STATUS_LABEL[value]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
        </div>
      </div>
      {descriptionOpen && item.description && <p className="m-0 text-caption text-text-secondary">{item.description}</p>}
      {noteEditor ? (
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={noteInputId}>{noteEditor === 'note-only' || frozen ? 'Note' : 'Why tentative?'}</Label>
            <Input
              autoFocus
              id={noteInputId}
              className="w-72"
              value={draftNote}
              aria-invalid={refused ? true : undefined}
              aria-describedby={refused ? noteErrorId : undefined}
              onChange={(e) => setDraftNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  cancelNote();
                }
              }}
            />
            {refused && <Refusal id={noteErrorId}>{refused}</Refusal>}
          </div>
          <Button type="button" size="sm" onClick={commit}>
            Save
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={cancelNote}>
            Cancel
          </Button>
        </div>
      ) : (
        item.note && <p className="m-0 text-caption text-text-muted">{item.note}</p>
      )}
    </li>
  );
}

