import type { BrandPack } from '../brand/types';
import { allocationRefusal, type Period } from '../data/cost';
import { formatDateEn, formatMonthEn } from '../data/dates';
import { activeMembership } from '../data/teamMembers';
import { newId } from '../data/ids';
import { isPhaseFrozen } from '../data/frozen';
import { extendByOneMonth } from '../data/defaultPlan';
import { periodMonthsEn } from '../data/period';
import { copySource, planCopy } from '../data/copyAllocations';
import { withChecklistItem } from '../data/gate';
import type { Allocation, ChecklistStatus, CostItem, Initiative, PhasePlan, Person } from '../data/types';
import type { CommitNote } from './FileWriter';
import type { RepositoryState } from './Repository';
import { allocationWords, costItemWords, note as entityNote, personName } from './commitWords';

/** What Copy from <previous phase> did: how many allocations were added and who was skipped (§5.11). */
export type CopyAllocationsResult = { copied: number; skipped: Person[] };

/** Why an allocation wasn't added (§7.2), in words the page can show as is. */
export type AddAllocationResult = { ok: true; allocation: Allocation } | { ok: false; reason?: string };

/** `item` put back at `index` (or last, when the list has since shrunk): where an Undo restores a removed list item. */
export function insertAt<T>(list: T[], item: T, index: number): T[] {
  const next = [...list];
  next.splice(Math.min(index, next.length), 0, item);
  return next;
}

/** One change to a cost item, of the one field the commit note names. */
export type CostItemChange = { label: string } | { amount: number } | { timing: 'spread' } | { timing: 'month'; month: string } | { month: string };

/** The phase lists whose items are removed with an Undo (§5.11). */
export type PhaseList = 'allocations' | 'costItems';

/** A phase list's items as the caller knows them; `list` says which, so the one cast is here. */
export const itemsOf = <T extends { id: string }>(plan: PhasePlan | undefined, list: PhaseList): T[] => (plan?.[list] ?? []) as unknown as T[];


/** What the initiative edits need of the repository they edit: its state, and the one place an initiative is replaced and saved. */
export interface InitiativeEditHost {
  getState: () => RepositoryState;
  brand: BrandPack;
  /** The initiative, unless it is missing or frozen (§8.4). */
  editableInitiative: (initiativeId: string) => Initiative | undefined;
  phaseLabel: (phaseId: string) => string;
  /** Puts the initiative on screen in place of the one with its id. */
  replaceInitiative: (next: Initiative) => void;
  /** Schedules the save of the initiative's file under `note`. */
  schedule: (initiativeId: string, next: Initiative, note: CommitNote) => void;
  /** An edit the freeze overtook is reported in the phase (§8.1). */
  noteLostEdits: (initiativeId: string, phaseIds: string[]) => void;
  /** An amount as a commit message reads it, in the deployment's currency (§9.7). */
  money: (amount: number) => string;
}

/**
 * The in-place edits to an initiative and its phase plans (§5.4): name, description, owner, periods, allocations,
 * cost items, actuals and checklist items. Each reads the initiative on screen, makes one change and hands it to the
 * host to show and save, with a note for its commit message (§10.3).
 */
export class InitiativeEditCommands {
  constructor(private readonly host: InitiativeEditHost) {}

  private get state(): RepositoryState {
    return this.host.getState();
  }

  /** Rename an initiative in place (§5.4). An empty name is refused (returns false) and the old one stays. */
  renameInitiative(initiativeId: string, name: string): boolean {
    const initiative = this.host.editableInitiative(initiativeId);
    const trimmed = name.trim();
    if (!initiative || !trimmed) return false;
    if (trimmed === initiative.name) return true;
    const next: Initiative = { ...initiative, name: trimmed };
    this.host.replaceInitiative(next);
    this.host.schedule(initiativeId, 
      next,
      entityNote('initiative', initiativeId, 'name', initiative.name, trimmed, (f, t) => `${f}: renamed to ${t}`),
    );
    return true;
  }

  /** Set or clear the initiative's description in place (§5.4). Trimmed; empty clears it. */
  setDescription(initiativeId: string, text: string): boolean {
    const initiative = this.host.editableInitiative(initiativeId);
    if (!initiative) return false;
    const trimmed = text.trim();
    if (trimmed === (initiative.description ?? '')) return true;
    const next: Initiative = { ...initiative, description: trimmed };
    if (!trimmed) delete next.description;
    this.host.replaceInitiative(next);
    this.host.schedule(initiativeId, 
      next,
      entityNote('initiative', initiativeId, 'description', initiative.description, next.description, () => `${initiative.name}: description changed`),
    );
    return true;
  }

  /** Set or clear (`undefined`) the initiative's owner in place (§5.4). */
  setOwner(initiativeId: string, ownerId: string | undefined): void {
    const initiative = this.host.editableInitiative(initiativeId);
    if (!initiative || ownerId === initiative.ownerId) return;
    const next: Initiative = { ...initiative, ownerId };
    if (ownerId === undefined) delete next.ownerId;
    this.host.replaceInitiative(next);
    const words = (_: unknown, to: string | undefined) => (to ? `${initiative.name}: owner set to ${personName(this.state, to)}` : `${initiative.name}: owner cleared`);
    this.host.schedule(initiativeId, next, entityNote('initiative', initiativeId, 'ownerId', initiative.ownerId, ownerId, words));
  }

  /** Apply one edit to a phase's plan (§5.4: edited in place) and schedule its commit under `note`. */
  private editPhase<T>(
    initiativeId: string,
    phaseId: string,
    change: (plan: PhasePlan) => PhasePlan,
    note: { field: string; from: T | undefined; to: T | undefined; words: (from: T | undefined, to: T | undefined, initiativeName: string, phase: string) => string },
    /** Only a recorded actual is still accepted on a frozen initiative or phase (§8.4). An Undo is refused
     * silently on a frozen phase, as its offer is withdrawn once the phase freezes (§5.11); any other edit the
     * freeze overtook is reported in the phase (§8.1). */
    { allowFrozen = false, undo = false }: { allowFrozen?: boolean; undo?: boolean } = {},
  ): boolean {
    const initiative = allowFrozen ? this.state.initiatives.find((i) => i.id === initiativeId) : this.host.editableInitiative(initiativeId);
    if (!initiative) return false;
    if (!allowFrozen && isPhaseFrozen(initiative, phaseId)) {
      if (!undo) this.host.noteLostEdits(initiative.id, [phaseId]);
      return false;
    }
    const plan = initiative.phases?.[phaseId] ?? { allocations: [] };
    // The first edit to the plan ends the suggestion: from here on the dates are the user's (§8.2).
    const next: Initiative = { ...initiative, phases: { ...initiative.phases, [phaseId]: change(plan) } };
    delete next.defaultPlan;
    this.host.replaceInitiative(next);
    const name = initiative.name;
    this.host.schedule(initiativeId, next, entityNote('initiative', initiativeId, `${phaseId}:${note.field}`, note.from, note.to, (f, t) => note.words(f, t, name, this.host.phaseLabel(phaseId))));
    return true;
  }

  /**
   * Set a phase's whole period at once (§9.11 period picker, saved on Done): one write and one commit, "Payments API:
   * Development period set to Apr–Sep". An `undefined` end clears it, and any dates are accepted: an inverted period
   * only warns (§7.2). Nothing is written when neither date changes.
   */
  setPhasePeriod(initiativeId: string, phaseId: string, period: Period): void {
    const plan = this.state.initiatives.find((i) => i.id === initiativeId)?.phases?.[phaseId];
    const before = { startDate: plan?.startDate, endDate: plan?.endDate };
    if (before.startDate === period.startDate && before.endDate === period.endDate) return;
    const to = { startDate: period.startDate, endDate: period.endDate };
    this.editPhase<Period>(
      initiativeId,
      phaseId,
      (current) => {
        const next = { ...current };
        for (const which of ['startDate', 'endDate'] as const) {
          if (to[which] === undefined) delete next[which];
          else next[which] = to[which];
        }
        return next;
      },
      {
        field: 'period',
        from: before,
        to,
        words: (_, after, name, phase) => {
          const { startDate, endDate } = after ?? {};
          if (startDate && endDate) return `${name}: ${phase} period set to ${periodMonthsEn(startDate, endDate)}`;
          if (startDate) return `${name}: ${phase} start date set to ${formatDateEn(startDate)}, no end date`;
          if (endDate) return `${name}: ${phase} end date set to ${formatDateEn(endDate)}, no start date`;
          return `${name}: ${phase} period cleared`;
        },
      },
    );
  }

  /** Move a phase's end date a month later (§5.11 Extend on overrun), keeping its allocations; later phases do not move. */
  extendPhase(initiativeId: string, phaseId: string): void {
    const endDate = this.state.initiatives.find((i) => i.id === initiativeId)?.phases?.[phaseId]?.endDate;
    if (!endDate) return;
    const next = extendByOneMonth(endDate);
    this.editPhase<string>(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, endDate: next }),
      { field: 'endDate', from: endDate, to: next, words: (_, to, name, phase) => `${name}: ${phase} extended to ${formatDateEn(to as string)}` },
    );
  }

  /**
   * Allocate a person to a phase (§5.4). Only the initiative team's members can be allocated
   * (§7.2), and a refusal says why. Allocation % is `allocationPct` when the caller has worked out what fits (the
   * phase picker passes the person's free capacity, §5.11), else the person's Team FTE % on the team.
   */
  addAllocation(initiativeId: string, phaseId: string, personId: string, allocationPct?: number): AddAllocationResult {
    const initiative = this.host.editableInitiative(initiativeId);
    const person = this.state.people.find((p) => p.id === personId);
    const team = initiative && this.state.teams.find((t) => t.id === initiative.teamId);
    if (!initiative || !person || !team) return { ok: false, reason: 'That person or initiative could not be found.' };
    // Refused by a freeze, which the phase itself reports (§8.1), so no reason here.
    if (isPhaseFrozen(initiative, phaseId)) {
      this.host.noteLostEdits(initiative.id, [phaseId]);
      return { ok: false };
    }

    const reason = allocationRefusal(person, team, this.state.memberships);
    if (reason) return { ok: false, reason };
    if (initiative.phases?.[phaseId]?.allocations.some((a) => a.personId === personId)) {
      return { ok: false, reason: `${person.name} is already allocated to this phase.` };
    }

    const membership = activeMembership(personId, team.id, this.state.memberships);
    const allocation: Allocation = { id: newId(), personId, allocationPct: allocationPct ?? membership?.teamFtePct ?? 0 };
    this.editPhase<Allocation>(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, allocations: [...plan.allocations, allocation] }),
      { field: `allocations:${allocation.id}`, from: undefined, to: allocation, words: this.describeItem('allocations') },
    );
    return { ok: true, allocation };
  }

  /**
   * Copy the previous costed phase's allocations into an empty phase in one commit (§5.11): each active team member
   * with the same Allocation %. Nothing is written when the phase has people already, is frozen, or nobody can be copied.
   */
  copyAllocations(initiativeId: string, phaseId: string, fromPhaseId: string): CopyAllocationsResult | null {
    const initiative = this.host.editableInitiative(initiativeId);
    const team = initiative && this.state.teams.find((t) => t.id === initiative.teamId);
    if (!initiative || !team || isPhaseFrozen(initiative, phaseId)) return null;
    if ((initiative.phases?.[phaseId]?.allocations.length ?? 0) > 0) return null;

    const { copy, skipped } = planCopy(copySource(initiative, fromPhaseId), team, this.state.people, this.state.memberships);
    if (copy.length === 0) return { copied: 0, skipped };
    const allocations: Allocation[] = copy.map((c) => ({ id: newId(), ...c }));
    const fromLabel = this.host.phaseLabel(fromPhaseId);
    this.editPhase<Allocation[]>(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, allocations }),
      {
        field: 'allocations:copied',
        from: undefined,
        to: allocations,
        words: (_, to, name, phase) => `${name}: ${to?.length} ${to?.length === 1 ? 'person' : 'people'} copied to ${phase} from ${fromLabel}`,
      },
    );
    return { copied: allocations.length, skipped };
  }

  updateAllocation(initiativeId: string, phaseId: string, allocationId: string, allocationPct: number): void {
    const allocation = this.state.initiatives
      .find((i) => i.id === initiativeId)
      ?.phases?.[phaseId]?.allocations.find((a) => a.id === allocationId);
    if (!allocation) return;
    this.editPhase<Allocation>(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, allocations: plan.allocations.map((a) => (a.id === allocationId ? { ...a, allocationPct } : a)) }),
      { field: `allocations:${allocationId}`, from: allocation, to: { ...allocation, allocationPct }, words: this.describeItem('allocations') },
    );
  }

  /**
   * Remove an item from a phase's list; its position comes back so an Undo can put it where it was (§5.11).
   */
  private removeFromList<T extends { id: string }>(list: PhaseList, initiativeId: string, phaseId: string, itemId: string): { item: T; index: number } | null {
    const items = itemsOf<T>(this.state.initiatives.find((i) => i.id === initiativeId)?.phases?.[phaseId], list);
    const index = items.findIndex((item) => item.id === itemId);
    if (index < 0) return null;
    const item = items[index];
    const removed = this.editPhase<T>(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, [list]: itemsOf<T>(plan, list).filter((other) => other.id !== itemId) }),
      { field: `${list}:${itemId}`, from: item, to: undefined, words: this.describeItem(list) },
    );
    return removed ? { item, index } : null;
  }

  /** Undo of {@link removeFromList}: the same item, same id, back in its place, as a normal edit. Nothing happens when it is already there again. */
  private restoreToList<T extends { id: string }>(list: PhaseList, initiativeId: string, phaseId: string, item: T, index: number): void {
    const present = itemsOf<T>(this.state.initiatives.find((i) => i.id === initiativeId)?.phases?.[phaseId], list);
    if (present.some((other) => other.id === item.id)) return;
    this.editPhase<T>(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, [list]: insertAt(itemsOf<T>(plan, list), item, index) }),
      { field: `${list}:${item.id}`, from: undefined, to: item, words: this.describeItem(list) },
      { undo: true },
    );
  }

  /** Remove an allocation; the position comes back so an Undo can put it where it was (§5.11). */
  removeAllocation(initiativeId: string, phaseId: string, allocationId: string): { allocation: Allocation; index: number } | null {
    const removed = this.removeFromList<Allocation>('allocations', initiativeId, phaseId, allocationId);
    return removed && { allocation: removed.item, index: removed.index };
  }

  /** Undo of {@link removeAllocation}: the same allocation, same id, back in its place, as a normal edit. */
  restoreAllocation(initiativeId: string, phaseId: string, allocation: Allocation, index: number): void {
    this.restoreToList('allocations', initiativeId, phaseId, allocation, index);
  }

  /**
   * A phase list item's net change in plain words (§10.3): added, removed, or what changed in it. The person or label
   * is the one the item was saved under, so the message never names a state that was not saved.
   */
  private describeItem(list: PhaseList): (from: unknown, to: unknown, name: string, phase: string) => string {
    const lookups = { personName: (id: string) => personName(this.state, id), money: (amount: number) => this.host.money(amount) };
    return (list === 'allocations' ? allocationWords(lookups) : costItemWords(lookups)) as (from: unknown, to: unknown, name: string, phase: string) => string;
  }

  /** Add a cost item to a phase (§5.4); it is one commit, made once the draft row is complete. */
  addCostItem(initiativeId: string, phaseId: string, draft: Omit<CostItem, 'id'>): CostItem | null {
    const item: CostItem = { id: newId(), ...draft };
    const added = this.editPhase<CostItem>(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, costItems: [...(plan.costItems ?? []), item] }),
      { field: `costItems:${item.id}`, from: undefined, to: item, words: this.describeItem('costItems') },
    );
    return added ? item : null;
  }

  /** Change a cost item's label, amount or timing; the commit note names the one field changed. */
  updateCostItem(initiativeId: string, phaseId: string, itemId: string, change: CostItemChange): void {
    const item = this.state.initiatives.find((i) => i.id === initiativeId)?.phases?.[phaseId]?.costItems?.find((c) => c.id === itemId);
    if (!item) return;
    this.editPhase<CostItem>(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, costItems: (plan.costItems ?? []).map((c) => (c.id === itemId ? { ...c, ...change } : c)) }),
      { field: `costItems:${itemId}`, from: item, to: { ...item, ...change }, words: this.describeItem('costItems') },
    );
  }

  /** Remove a cost item; the position comes back so an Undo can put it where it was (§5.11). */
  removeCostItem(initiativeId: string, phaseId: string, itemId: string): { item: CostItem; index: number } | null {
    return this.removeFromList<CostItem>('costItems', initiativeId, phaseId, itemId);
  }

  /** Undo of {@link removeCostItem}. */
  restoreCostItem(initiativeId: string, phaseId: string, item: CostItem, index: number): void {
    this.restoreToList('costItems', initiativeId, phaseId, item, index);
  }

  /**
   * Record a month's actual for a phase (§7.3): the estimate confirmed as-is, or an override — either way a
   * single act, and recordable again later to correct it (§6).
   */
  setActual(initiativeId: string, phaseId: string, month: string, amount: number): void {
    const before = this.state.initiatives.find((i) => i.id === initiativeId)?.phases?.[phaseId]?.actualMonths?.[month];
    this.editPhase<number>(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, actualMonths: { ...plan.actualMonths, [month]: amount } }),
      {
        field: `actual:${month}`,
        from: before,
        to: amount,
        words: (_, to, name, phase) => `${name}: ${phase} actual for ${formatMonthEn(month)} recorded (${this.host.brand.currencySymbol}${Math.round(to as number)})`,
      },
      { allowFrozen: true },
    );
  }

  /** A checklist item's name, for the commit note, as its gate defines it. */
  private checklistItemName(phaseId: string, itemId: string): string {
    return this.host.brand.process.find((p) => p.id === phaseId)?.exitGate.checklistItems.find((i) => i.id === itemId)?.name ?? 'checklist item';
  }

  /**
   * Set a checklist item's status and note together (§5.4, §8.1): Incomplete and Complete commit as soon as
   * they're clicked; Tentative is saved together with its (required) note in one act.
   */
  setChecklistItem(initiativeId: string, phaseId: string, itemId: string, status: ChecklistStatus, note: string): void {
    const initiative = this.host.editableInitiative(initiativeId);
    if (!initiative) return;
    const before = initiative.checklist?.[phaseId]?.[itemId];
    this.writeChecklistItem(initiative, phaseId, itemId, { status, note }, '', before, { status, note }, (name, item, _, to) =>
      `${name}: "${item}" set to ${to ? to.status[0].toUpperCase() + to.status.slice(1) : 'Incomplete'}`,
    );
  }

  /**
   * Change a checklist item's note alone, keeping its status (§8.4): the one checklist edit a Closed or Cancelled
   * initiative still accepts. Trimmed; a Tentative item's note is required, so clearing it is refused (false).
   */
  setChecklistNote(initiativeId: string, phaseId: string, itemId: string, note: string): boolean {
    const initiative = this.state.initiatives.find((i) => i.id === initiativeId);
    if (!initiative) return false;
    const entry = initiative.checklist?.[phaseId]?.[itemId];
    const status = entry?.status ?? 'incomplete';
    const trimmed = note.trim();
    if (status === 'tentative' && !trimmed) return false;
    if (trimmed === (entry?.note ?? '')) return true;
    this.writeChecklistItem(initiative, phaseId, itemId, { status, note: trimmed }, ':note', entry?.note ?? '', trimmed, (name, item) => `${name}: note on "${item}" changed`);
    return true;
  }

  /** Write one checklist entry and schedule its commit; `fieldSuffix` keeps a note-only change its own field (§10.3). */
  private writeChecklistItem<T>(
    initiative: Initiative,
    phaseId: string,
    itemId: string,
    entry: { status: ChecklistStatus; note: string },
    fieldSuffix: string,
    from: T | undefined,
    to: T,
    words: (initiativeName: string, itemName: string, from: T | undefined, to: T | undefined) => string,
  ): void {
    const next = withChecklistItem(initiative, phaseId, itemId, entry.status, entry.note);
    this.host.replaceInitiative(next);
    const name = initiative.name;
    this.host.schedule(initiative.id, next, entityNote('initiative', initiative.id, `checklist:${phaseId}:${itemId}${fieldSuffix}`, from, to, (f, t) => words(name, this.checklistItemName(phaseId, itemId), f, t)));
  }
}
