import { WarningIcon } from './icons';

/** Why an action didn't happen, under it: Alarm text with the warning icon (§9.9). */
export function ActionError({ text }: { text: string }) {
  return (
    <p role="alert" className="m-0 mt-2 flex items-center gap-1 text-caption text-alarm-text">
      <WarningIcon width={13} height={13} />
      {text}
    </p>
  );
}
