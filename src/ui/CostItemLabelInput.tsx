import { useId, useMemo, useState, type ComponentProps } from 'react';
import { suggestCostItems, type CostItemSuggestion } from '../data/costItemSuggestions';
import { useBrand } from '../state/BrandContext';
import { useRepositoryState } from '../state/DataContext';
import { formatAmount } from './formatAmount';
import { Input } from '@/components/ui/input';

const TIMING_SHORT = { month: 'One month', spread: 'Spread' } as const;

/**
 * The draft row's label field (§5.11 Cost item suggestions): earlier labels from every initiative, most used
 * first, as an ARIA combobox. Choosing one hands its most recent amount and timing to `onChoose`; nothing is
 * highlighted until an arrow key, so Enter on typed text still goes to the row's own Add. Esc closes the list
 * first. Typing a label nobody used shows no list.
 */
export function CostItemLabelInput({
  value,
  onChange,
  onChoose,
  onKeyDown,
  ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'onKeyDown'> & {
  value: string;
  onChange: (label: string) => void;
  onChoose: (suggestion: CostItemSuggestion) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const { initiatives } = useRepositoryState();
  const { currencySymbol } = useBrand();
  const listId = useId();
  const suggestions = useMemo(() => suggestCostItems(initiatives, value), [initiatives, value]);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const open = suggestions.length > 0 && !dismissed;
  const optionId = (index: number) => `${listId}-${index}`;

  const close = () => {
    setDismissed(true);
    setActive(-1);
  };
  const choose = (suggestion: CostItemSuggestion) => {
    close();
    onChoose(suggestion);
  };
  const keys = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (suggestions.length === 0) return;
      event.preventDefault();
      if (!open) {
        setDismissed(false);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current === -1 ? (step === 1 ? 0 : suggestions.length - 1) : (current + step + suggestions.length) % suggestions.length));
    } else if (event.key === 'Enter' && open && active >= 0) {
      event.preventDefault();
      choose(suggestions[active]);
    } else if (event.key === 'Escape' && open) {
      // Closes the list and keeps the text; the row's own Esc, which cancels it, is for the next press.
      event.preventDefault();
      close();
    } else {
      onKeyDown(event);
    }
  };

  return (
    <div className="relative">
      <Input
        {...props}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setDismissed(false);
          setActive(-1);
        }}
        onBlur={() => setDismissed(true)}
        onKeyDown={keys}
      />
      <span role="status" className="sr-only">
        {open ? `${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'}` : ''}
      </span>
      {open && (
        <ul id={listId} role="listbox" aria-label="Earlier cost items" className="absolute z-10 mt-1 w-max min-w-full max-w-sm list-none rounded-md border border-border-default bg-popover text-popover-foreground p-1 shadow-md">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.label.toLowerCase()}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              // Keeps focus in the field: a click on an option must not blur it first, which would close the list.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(suggestion)}
              className={`flex cursor-default items-center justify-between gap-4 rounded-sm px-2 py-1.5 text-body ${index === active ? 'bg-surface-subtle' : 'hover:bg-surface-subtle'}`}
            >
              <span>{suggestion.label}</span>
              <span className="text-caption text-text-secondary">{`${suggestion.uses}× · ${formatAmount(suggestion.amount, currencySymbol)} · ${TIMING_SHORT[suggestion.timing]}`}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
