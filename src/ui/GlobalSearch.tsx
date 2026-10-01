import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { currentPhaseId } from '../data/processState';
import { searchAll, type Group, type InitiativeHit, type NamedHit } from '../data/search';
import type { InitiativeStatus } from '../data/types';
import { navigate } from '../router/useHashRoute';
import { useBrand } from '../state/BrandContext';
import { useRepositoryState } from '../state/DataContext';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusCancelledIcon, StatusClosedIcon, StatusOnHoldIcon, SearchIcon } from './icons';
import { requestPerson } from './personRequest';

const STATUS_ICON = { 'On Hold': StatusOnHoldIcon, Cancelled: StatusCancelledIcon, Closed: StatusClosedIcon };
/** Characters of a description shown before the match, so a match far into the text is still in view. */
const EXCERPT_LEAD = 30;

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

function inTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** The search icon in the top bar, the search overlay and its shortcuts (§5.1, §9.5). */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const opener = useRef<Element | null>(null);
  const show = () => {
    opener.current = document.activeElement;
    setOpen(true);
  };
  // The shortcuts have no trigger for Radix to hand focus back to, so the element focused before is kept here (§9.5).
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    if (opener.current instanceof HTMLElement) opener.current.focus();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      const isK = modifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k';
      const isSlash = event.key === '/' && !modifier && !event.altKey && !inTextField(event.target) && !document.querySelector('[role="dialog"]');
      if (isK || isSlash) {
        event.preventDefault();
        show();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-subtle"
            aria-label="Search"
            onClick={show}
          >
            <SearchIcon />
          </button>
        </TooltipTrigger>
        <TooltipContent>{isMac() ? 'Search (⌘K)' : 'Search (Ctrl+K)'}</TooltipContent>
      </Tooltip>
      <SearchOverlay open={open} onOpenChange={setOpen} restoreFocus={restoreFocus} />
    </>
  );
}

function Highlighted({ text, range }: { text: string; range: [number, number] }) {
  return (
    <>
      {text.slice(0, range[0])}
      <mark className="rounded-xs bg-warning-tint text-inherit">{text.slice(range[0], range[1])}</mark>
      {text.slice(range[1])}
    </>
  );
}

/** One line of the description around its match, cut at the front when the match is far in. */
function excerpt(description: string, range: [number, number]): ReactNode {
  const start = Math.max(0, range[0] - EXCERPT_LEAD);
  return (
    <>
      {start > 0 && '…'}
      <Highlighted text={description.slice(start)} range={[range[0] - start, range[1] - start]} />
    </>
  );
}

function GroupHeading({ label, group }: { label: string; group: Group<unknown> }) {
  return (
    <span className="flex justify-between">
      <span>{label}</span>
      {group.total > group.hits.length && <span className="font-normal">{`${group.hits.length} of ${group.total}`}</span>}
    </span>
  );
}

function SearchOverlay({ open, onOpenChange, restoreFocus }: { open: boolean; onOpenChange: (open: boolean) => void; restoreFocus: (event: Event) => void }) {
  const { initiatives, people, teams } = useRepositoryState();
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchAll(query, { initiatives, people, teams }), [query, initiatives, people, teams]);
  const typed = query.trim() !== '';
  const none = typed && results.initiatives.total + results.people.total + results.teams.total === 0;

  const choose = (go: () => void) => {
    onOpenChange(false);
    go();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery('');
        onOpenChange(next);
      }}
    >
      <DialogContent className="overflow-hidden p-0" showCloseButton={false} onCloseAutoFocus={restoreFocus}>
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>Find an initiative, person or team by name.</DialogDescription>
        </DialogHeader>
        {/* The overlay ranks and caps the matches itself (§5.1), so the component's own fuzzy filter is off. */}
        <Command shouldFilter={false} label="Search initiatives, people and teams" className="[&_[cmdk-group-heading]]:text-text-secondary">
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search…" />
          <CommandList>
            {(!typed || none) && (
              <p role={none ? 'status' : undefined} className="m-0 px-3 py-6 text-center text-sm text-text-secondary">
                {none ? `No matches for ‘${query.trim()}’` : 'Search initiatives, people and teams'}
              </p>
            )}
            {results.initiatives.total > 0 && (
              <CommandGroup heading={<GroupHeading label="Initiatives" group={results.initiatives} />}>
                {results.initiatives.hits.map((hit) => (
                  <InitiativeItem key={hit.initiative.id} hit={hit} onChoose={() => choose(() => navigate(`/initiatives/${hit.initiative.id}`))} />
                ))}
              </CommandGroup>
            )}
            {results.people.total > 0 && (
              <CommandGroup heading={<GroupHeading label="People" group={results.people} />}>
                {results.people.hits.map((hit) => (
                  <NamedItem key={hit.item.id} prefix="person" hit={hit} onChoose={() => choose(() => { requestPerson(hit.item.id); navigate('/people'); })} />
                ))}
              </CommandGroup>
            )}
            {results.teams.total > 0 && (
              <CommandGroup heading={<GroupHeading label="Teams" group={results.teams} />}>
                {results.teams.hits.map((hit) => (
                  <NamedItem key={hit.item.id} prefix="team" hit={hit} onChoose={() => choose(() => navigate(`/teams/${hit.item.id}`))} />
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function NamedItem({ prefix, hit, onChoose }: { prefix: string; hit: NamedHit<{ id: string; name: string; active: boolean }>; onChoose: () => void }) {
  const { item, range } = hit;
  return (
    <CommandItem value={`${prefix}:${item.id}`} onSelect={onChoose}>
      <span className="truncate" title={item.name}>
        <Highlighted text={item.name} range={range} />
        {!item.active && ' (inactive)'}
      </span>
    </CommandItem>
  );
}

function InitiativeItem({ hit, onChoose }: { hit: InitiativeHit; onChoose: () => void }) {
  const { process } = useBrand();
  const { initiative } = hit;
  const StatusIcon = initiative.status === 'Active' ? null : STATUS_ICON[initiative.status as Exclude<InitiativeStatus, 'Active'>];
  const phaseId = currentPhaseId(initiative, process);
  return (
    <CommandItem value={`initiative:${initiative.id}`} onSelect={onChoose}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate" title={initiative.name}>
            {hit.field === 'name' ? <Highlighted text={initiative.name} range={hit.range} /> : initiative.name}
          </span>
          {StatusIcon && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-subtle px-2 py-0.5 text-[11px] text-text-secondary">
              <StatusIcon width={12} height={12} aria-hidden />
              {initiative.status}
            </span>
          )}
          <span className="ml-auto shrink-0 text-xs text-text-secondary">{process.find((p) => p.id === phaseId)?.label ?? phaseId}</span>
        </div>
        {hit.field === 'description' && <div className="truncate text-xs text-text-secondary">{excerpt(initiative.description ?? '', hit.range)}</div>}
      </div>
    </CommandItem>
  );
}
