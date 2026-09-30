import type { ComponentProps } from 'react';
import { Refusal } from './CommitInput';
import { Input } from '@/components/ui/input';

/**
 * One field of an unsaved draft row (Add role, Add country): an `Input` with its refusal message wired up via
 * `aria-invalid`/`aria-describedby`, and an optional hint it is also described by.
 */
export function DraftField({ errorId, error, hintId, ...input }: ComponentProps<typeof Input> & { errorId: string; error?: string; hintId?: string }) {
  const describedBy = [error ? errorId : null, hintId ?? null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1">
      <Input aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      {error && <Refusal id={errorId}>{error}</Refusal>}
    </div>
  );
}
