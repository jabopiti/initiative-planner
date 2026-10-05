import { useBrand } from '../state/BrandContext';
import { useNeedsAttentionItems } from '../state/NeedsAttentionContext';
import { GlobalSearch } from './GlobalSearch';
import { NewInitiativeControl } from './NewInitiativeControl';
import { SyncIndicator } from './SyncIndicator';
import { ThemeControl } from './ThemeControl';
import { LogoMark } from './icons';
import { pageContainerClass } from './Page';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
  const attentionLabel = `${needsAttentionCount} ${needsAttentionCount === 1 ? 'needs' : 'need'} attention`;
  return (
    <header className="sticky top-0 z-10 border-b border-border-default bg-surface-card">
      {/* The bar spans the window; its content lines up with the page container below (§9.8). */}
      <div className={`${pageContainerClass} flex items-center gap-6 py-2.5`}>
        <a href="#/portfolio" className="flex shrink-0 items-center gap-2 font-medium text-text-primary no-underline">
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-label font-medium text-text-secondary" aria-label={attentionLabel}>
                        {needsAttentionCount}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{attentionLabel}</TooltipContent>
                  </Tooltip>
                )}
              </a>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <NewInitiativeControl onPortfolio={route === '/portfolio'} />
          <GlobalSearch />
          <SyncIndicator />
          <ThemeControl />
        </div>
      </div>
    </header>
  );
}
