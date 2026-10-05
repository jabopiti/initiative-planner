import { IconMarker } from './AttentionMarker';

/** The Accent dot itself, for where it is only decoration. */
export const ChangedDot = () => <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-brand-accent" />;

/** Changed since the user last looked (§9.9): an Accent dot, focusable, named by what it says; never says who changed it. */
export function ChangedMarker() {
  return (
    <IconMarker label="Changed since you last looked" tooltip="Changed since you last looked" className="size-4 items-center justify-center">
      <ChangedDot />
    </IconMarker>
  );
}
