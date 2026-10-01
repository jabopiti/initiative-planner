import type { MouseEvent } from 'react';
import { Button } from '@/components/ui/button';

/** The reduce fix for a capacity warning (§5.11): one click sets the allocation to the highest whole % that fits. */
export function ReduceFixButton({ name, to, where, className, onClick }: { name: string; to: number; where: string; className?: string; onClick: (e: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <Button type="button" variant="secondary" size="xs" className={className} aria-label={`Set ${name} to ${to}% in ${where}`} onClick={onClick}>
      Set to {to}%
    </Button>
  );
}

/** The raise fix for an over Team FTE % warning (§5.11): one click raises the person's Team FTE % to cover their peak. */
export function RaiseFixButton({ name, teamName, to, onClick }: { name: string; teamName: string; to: number; onClick: (e: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <Button type="button" variant="secondary" size="xs" aria-label={`Raise ${name}'s Team FTE % on ${teamName} to ${to}%`} onClick={onClick}>
      Raise Team FTE % to {to}%
    </Button>
  );
}
