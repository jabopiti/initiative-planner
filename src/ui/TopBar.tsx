import { useBrand } from '../state/BrandContext';
import { NewInitiativeControl } from './NewInitiativeControl';
import { SyncIndicator } from './SyncIndicator';
import { LogoMark, SearchIcon } from './icons';
import { useNeedsAttentionItems } from './useNeedsAttentionItems';

const NAV_ITEMS: { label: string; path: string }[] = [
  { label: 'Portfolio', path: '/portfolio' },
  { label: 'Initiatives', path: '/initiatives' },
  { label: 'People', path: '/people' },
  { label: 'Teams', path: '/teams' },
  { label: 'Settings', path: '/settings' },
];

/** The top navigation bar (§5.1), including the Initiatives nav item's Needs attention count (§8.5). */
export function TopBar({ route }: { route: string }) {
  const brand = useBrand();
  const needsAttentionCount = useNeedsAttentionItems().length;
  return (
    <header className="sticky top-0 z-10 flex items-center gap-6 border-b border-border-default bg-surface-card px-5 py-2.5">
      <a href="#/portfolio" className="flex shrink-0 items-center gap-2 font-bold text-text-primary no-underline">
        <LogoMark />
        {brand.productName}
      </a>

      <nav className="flex flex-1 gap-1" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const active = route === item.path || route.startsWith(`${item.path}/`);
          return (
            <a
              key={item.path}
              href={`#${item.path}`}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'flex items-center gap-1.5 rounded-lg bg-brand-accent-tint px-3 py-1.5 font-medium text-brand-accent-text no-underline'
                  : 'flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-text-secondary no-underline'
              }
            >
              {item.label}
              {item.path === '/initiatives' && needsAttentionCount > 0 && (
                <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[11px] font-medium text-text-secondary" aria-label={`${needsAttentionCount} needing attention`}>
                  {needsAttentionCount}
                </span>
              )}
            </a>
          );
        })}
      </nav>

      <div className="flex items-center gap-3">
        <NewInitiativeControl />
        {/* Search (§5.1's grouped search over cached data) isn't built yet — the icon is present so the
            bar's layout matches §5.1, but it's inert for now. */}
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-lg text-text-secondary disabled:cursor-not-allowed disabled:opacity-40"
          disabled
          aria-label="Search (not yet available)"
        >
          <SearchIcon />
        </button>
        <SyncIndicator />
      </div>
    </header>
  );
}
