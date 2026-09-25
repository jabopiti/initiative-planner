import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useHoldWhileEditing } from '../state/DataContext';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { CalendarIcon } from './icons';

/**
 * The shell of the date and month inputs (§9.11): a text field you can type into, with a picker in a popover
 * beneath it. The cursor stays in the field while the popover is open; ↓ moves into the picker (the first
 * element `pickerFocus` finds), Esc closes it, and Tab moves on to the next field. The typed text commits when
 * it reads as a value (on Enter or when focus leaves the control), and clearing it clears the value unless it is
 * `required`. `parse` returns null for text that is not a value, which shows `refusal` under the field.
 */
export function PopoverTextField({
  value,
  label,
  placeholder,
  refusal,
  required,
  highlight,
  changed,
  widthClassName,
  format,
  parse,
  onChange,
  onOpen,
  onTyped,
  pickerFocus,
  pickerClassName = 'w-auto p-0',
  children,
}: {
  value: string | undefined;
  label: string;
  placeholder: string;
  refusal: string;
  required?: boolean;
  /** Marks the field as the next thing to fill in. */
  highlight?: boolean;
  /** Another user's change just updated this value (§9.9). */
  changed?: boolean;
  widthClassName: string;
  format: (value: string) => string;
  parse: (text: string) => string | null;
  onChange: (value: string | undefined) => void;
  /** The popover is about to open with `draft` typed, so the picker can start where the field points. */
  onOpen?: (draft: string) => void;
  /** The typed text now reads as `parsed`, so the picker follows it. */
  onTyped?: (parsed: string) => void;
  /** Selectors for the picker element ↓ moves into, the first that matches winning. */
  pickerFocus: string[];
  pickerClassName?: string;
  /** The picker; `select` commits the value picked in it (none, when the pick was a deselect) and returns the focus to the field. */
  children: (select: (picked: string | undefined) => void) => ReactNode;
}) {
  const shown = value ? format(value) : '';
  const [draft, setDraft] = useState(shown);
  const [unreadable, setUnreadable] = useState(false);
  const [open, setOpen] = useState(false);
  const errorId = useId();
  useHoldWhileEditing(draft !== shown);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setDraft(shown);
    setUnreadable(false);
  }, [shown]);

  const commit = () => {
    if (draft.trim() === '') {
      if (required) {
        // The value stays what it was, and so does what the field shows.
        setDraft(shown);
        setUnreadable(true);
      } else if (value !== undefined) onChange(undefined);
      return;
    }
    const parsed = parse(draft);
    if (!parsed) {
      setUnreadable(true);
      return;
    }
    setUnreadable(false);
    setDraft(format(parsed));
    if (parsed !== value) onChange(parsed);
  };

  const openPicker = () => {
    if (open) return;
    onOpen?.(draft);
    setOpen(true);
  };

  return (
    <div className="flex flex-col gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className={`relative ${widthClassName}`}>
            <Input
              ref={inputRef}
              type="text"
              className={`w-full pr-9 transition-colors duration-500 ${highlight ? 'border-brand-accent bg-brand-accent-tint' : changed ? 'bg-met-tint' : ''}`}
              aria-label={label}
              aria-invalid={unreadable || undefined}
              aria-describedby={unreadable ? errorId : undefined}
              placeholder={placeholder}
              value={draft}
              onClick={openPicker}
              onChange={(e) => {
                setDraft(e.target.value);
                const parsed = parse(e.target.value);
                if (parsed) onTyped?.(parsed);
                openPicker();
              }}
              onBlur={(e) => {
                // Focus moving into the picker is not leaving the control.
                if (pickerRef.current?.contains(e.relatedTarget as Node | null)) return;
                commit();
                setOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commit();
                  setOpen(false);
                } else if (e.key === 'Escape' || e.key === 'Tab') {
                  // Tab moves on to the next field, not into the picker (↓ does that), so the typed text commits as focus leaves.
                  setOpen(false);
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  openPicker();
                  // The picker mounts on the next frame; its selected element takes the focus.
                  requestAnimationFrame(() => {
                    for (const selector of pickerFocus) {
                      const target = pickerRef.current?.querySelector<HTMLElement>(selector);
                      if (target) return target.focus();
                    }
                  });
                }
              }}
            />
            <CalendarIcon width={16} height={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-secondary" />
          </div>
        </PopoverAnchor>
        <PopoverContent
          ref={pickerRef}
          className={pickerClassName}
          align="start"
          // Opening must not steal the cursor from the field, and clicking the field is not "outside".
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (e.target === inputRef.current) e.preventDefault();
          }}
          onEscapeKeyDown={() => inputRef.current?.focus()}
          // The field keeps the focus while the picker is clicked (Safari does not focus a clicked button, so the blur would commit and close it first).
          onMouseDown={(e) => e.preventDefault()}
        >
          {children((picked) => {
            if (picked !== undefined) {
              setUnreadable(false);
              setDraft(format(picked));
              if (picked !== value) onChange(picked);
            }
            setOpen(false);
            inputRef.current?.focus();
          })}
        </PopoverContent>
      </Popover>
      {unreadable && (
        <p id={errorId} role="alert" className="m-0 text-xs text-warning-text">
          {refusal}
        </p>
      )}
    </div>
  );
}
