import type { ReactNode } from 'react';
import { AboutSection } from './AboutSection';
import { ConnectionSection } from './ConnectionSection';
import { CountriesSection } from './CountriesSection';
import { DangerZoneSection } from './DangerZoneSection';
import { ProcessSection } from './ProcessSection';
import { RolesSection } from './RolesSection';
import { Page } from './Page';
import { useSectionLock } from './useSectionLock';

/**
 * Settings' section list (§5.9): each entry is a section other slices append to as they build it (030
 * Countries & rates, 031 Process/Connection/About, 032 Danger zone), so this list stays additive across
 * parallel slices. A section not yet built isn't listed, like an unbuilt action in an Actions menu.
 */
const SETTINGS_SECTIONS: { id: string; label: string }[] = [
  { id: 'roles', label: 'Roles' },
  { id: 'countries', label: 'Countries & rates' },
  { id: 'process', label: 'Process' },
  { id: 'connection', label: 'Connection' },
  { id: 'about', label: 'About' },
  { id: 'danger-zone', label: 'Danger zone' },
];

export const DEFAULT_SECTION = SETTINGS_SECTIONS[0].id;

/** Settings (§5.9): a left section list and the chosen section on the right; an unknown section falls back to the default. */
export function SettingsPage({ section }: { section: string }) {
  const active = SETTINGS_SECTIONS.find((s) => s.id === section) ?? SETTINGS_SECTIONS[0];
  // Every lockable section's lock is held here, unconditionally, so switching sections never remounts (and
  // so never re-locks) one that isn't showing (§2) — only leaving Settings entirely, which unmounts this
  // whole component, does. A section other slices add gets its own `useSectionLock()` call here, the same way.
  const rolesLock = useSectionLock();
  const countriesLock = useSectionLock();
  const dangerZoneLock = useSectionLock();
  const sections: Record<string, ReactNode> = {
    roles: <RolesSection lock={rolesLock} />,
    countries: <CountriesSection lock={countriesLock} />,
    process: <ProcessSection />,
    connection: <ConnectionSection />,
    about: <AboutSection />,
    'danger-zone': <DangerZoneSection lock={dangerZoneLock} />,
  };
  const content = sections[active.id];

  return (
    <Page title="Settings">
      <div className="flex gap-6">
        <nav aria-label="Settings sections" className="w-44 shrink-0 border-r border-border-default pr-4">
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
        <div className="min-w-0 flex-1">{content}</div>
      </div>
    </Page>
  );
}
