import { RolesSection } from './RolesSection';

/**
 * Settings' section list (§5.9): each entry is a section other slices append to as they build it (030
 * Countries & rates, 031 Process/Connection/About, 032 Danger zone), so this list stays additive across
 * parallel slices. A section not yet built isn't listed, like an unbuilt action in an Actions menu.
 */
const SETTINGS_SECTIONS: { id: string; label: string; render: () => React.ReactElement }[] = [
  { id: 'roles', label: 'Roles', render: () => <RolesSection /> },
];

const DEFAULT_SECTION = SETTINGS_SECTIONS[0].id;

/** Settings (§5.9): a left section list and the chosen section on the right; an unknown section falls back to the default. */
export function SettingsPage({ section }: { section: string }) {
  const active = SETTINGS_SECTIONS.find((s) => s.id === section) ?? SETTINGS_SECTIONS[0];

  return (
    <div className="flex gap-6 px-8 py-6">
      <nav aria-label="Settings sections" className="w-44 shrink-0 border-r border-border-default pr-4">
        <h1 className="m-0 mb-4 text-xl">Settings</h1>
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {SETTINGS_SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#/settings/${s.id}`}
                aria-current={s.id === active.id ? 'page' : undefined}
                className={
                  s.id === active.id
                    ? 'block rounded-md bg-brand-accent-tint px-3 py-1.5 font-medium text-brand-accent-text no-underline'
                    : 'block rounded-md px-3 py-1.5 text-text-primary no-underline'
                }
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">{active.render()}</div>
    </div>
  );
}

export { DEFAULT_SECTION };
