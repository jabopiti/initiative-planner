import { defaultBrandPack } from '../brand/defaultBrand';
import { NewInitiativeControl } from './NewInitiativeControl';
import { SyncIndicator } from './SyncIndicator';
import { LogoMark, SearchIcon } from './icons';
import styles from './TopBar.module.css';

const NAV_ITEMS: { label: string; path: string }[] = [
  { label: 'Portfolio', path: '/portfolio' },
  { label: 'Initiatives', path: '/initiatives' },
  { label: 'People', path: '/people' },
  { label: 'Teams', path: '/teams' },
  { label: 'Settings', path: '/settings' },
];

/** The top navigation bar (§5.1). */
export function TopBar({ route }: { route: string }) {
  return (
    <header className={styles.bar}>
      <a className={styles.brand} href="#/portfolio">
        <LogoMark />
        {defaultBrandPack.productName}
      </a>

      <nav className={styles.nav} aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.path}
            href={`#${item.path}`}
            className={route === item.path || route.startsWith(`${item.path}/`) ? styles.navItemActive : styles.navItem}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className={styles.right}>
        <NewInitiativeControl />
        {/* Search overlay isn't in slice 003's scope (§5.1's grouped search over cached data is separate,
            unverified-by-acceptance work) — the icon is present so the bar's layout matches §5.1, but it's
            inert for now. */}
        <button type="button" className={styles.iconButton} disabled aria-label="Search (not yet available)">
          <SearchIcon />
        </button>
        <SyncIndicator />
      </div>
    </header>
  );
}
