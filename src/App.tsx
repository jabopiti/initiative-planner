import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { tokenStore } from './auth/tokenStore';
import { defaultBrandPack } from './brand/defaultBrand';
import { BrandProvider } from './state/BrandContext';
import { RepositoryProvider, useRepositoryState } from './state/DataContext';
import { SeenProvider } from './state/SeenContext';
import { NeedsAttentionProvider } from './state/NeedsAttentionContext';
import { SessionContext, type Session } from './state/SessionContext';
import { ClassicTokenBanner } from './ui/ClassicTokenBanner';
import { ConnectScreen } from './ui/ConnectScreen';
import { TopBar } from './ui/TopBar';
import { CacheFullBanner } from './ui/CacheFullBanner';
import { ReadOnlyBanner } from './ui/ReadOnlyBanner';
import { ConflictBanner } from './ui/ConflictBanner';
import { ConflictUiProvider } from './state/ConflictUi';
import { PortfolioBoard } from './ui/PortfolioBoard';
import { TeamsOverview } from './ui/TeamsOverview';
import { InitiativeDetail } from './ui/InitiativeDetail';
import { NewInitiativeDraft } from './ui/NewInitiativeDraft';
import { PeopleOverview } from './ui/PeopleOverview';
import { TeamDetail } from './ui/TeamDetail';
import { InitiativesTable } from './ui/InitiativesTable';
import { SettingsPage, DEFAULT_SECTION } from './ui/SettingsPage';
import { useHashRoute } from './router/useHashRoute';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

export function Screen({ route }: { route: string }) {
  const { status } = useRepositoryState();
  // Until the dataset has loaded every list would read as empty and every id as missing, so no screen shows. If it
  // cannot load, the read-only banner above carries the reason (§3, §9.9), once.
  if (status === 'loading') return null;
  const screen = screenFor(route);
  // Each new screen fades in (150 ms, slice 059); a jump within a page or a Settings section switch is the same screen
  // (the same key) and doesn't.
  return (
    <div key={screen.key} className="motion-safe:animate-fade-in">
      {screen}
    </div>
  );
}

/** The screen a route shows, keyed by which screen it is: the same key for the same screen, whatever its query or Settings section. */
export function screenFor(route: string): ReactElement {
  if (route === '/teams') return <TeamsOverview key="teams" />;
  if (route.startsWith('/teams/')) return <TeamDetail key={route} id={route.slice('/teams/'.length)} />;
  if (route === '/initiatives/new' || route.startsWith('/initiatives/new?')) {
    return <NewInitiativeDraft key="initiatives/new" presetTeamId={new URLSearchParams(route.split('?')[1]).get('team') ?? undefined} />;
  }
  if (route.startsWith('/initiatives/')) {
    // A Needs attention strip link (§5.2, §8.5) carries where to scroll and focus as a query suffix on the
    // hash path, since the hash router (useHashRoute.ts) otherwise treats the whole path as one opaque route.
    const rest = route.slice('/initiatives/'.length);
    const [id, query = ''] = rest.split('?');
    const params = new URLSearchParams(query);
    return <InitiativeDetail key={`initiatives/${id}`} id={id} focus={params.get('focus')} openPhaseId={params.get('openPhase')} />;
  }
  if (route === '/initiatives') return <InitiativesTable key="initiatives" />;
  if (route === '/people') return <PeopleOverview key="people" />;
  if (route === '/settings') return <SettingsPage key="settings" section={DEFAULT_SECTION} />;
  if (route.startsWith('/settings/')) return <SettingsPage key="settings" section={route.slice('/settings/'.length)} />;
  return <PortfolioBoard key="portfolio" />;
}

function MainApp({ token }: { token: string }) {
  const route = useHashRoute();
  return (
    <RepositoryProvider token={token} keepTrackedYears>
      <SeenProvider>
      <NeedsAttentionProvider>
        <ConflictUiProvider>
          <TopBar route={route} />
          <main>
            <ClassicTokenBanner />
            <ReadOnlyBanner />
            <ConflictBanner />
            <CacheFullBanner />
            <Screen route={route} />
          </main>
        </ConflictUiProvider>
      </NeedsAttentionProvider>
      </SeenProvider>
    </RepositoryProvider>
  );
}

export function App() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [login, setLogin] = useState<string | null>(null);
  const [classicWarning, setClassicWarningState] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Storage unavailable: connect again rather than show nothing.
    Promise.all([
      tokenStore.load().catch(() => null),
      tokenStore.loadLogin().catch(() => null),
      tokenStore.loadClassicWarning().catch(() => false),
    ]).then(([stored, storedLogin, storedClassic]) => {
      if (cancelled) return;
      setLogin(stored ? storedLogin : null);
      setClassicWarningState(stored ? storedClassic : false);
      setToken(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const session = useMemo<Session>(
    () => ({
      login,
      rememberLogin: (found) => {
        setLogin(found);
        void tokenStore.saveLogin(found);
      },
      classicWarning,
      setClassicWarning: (on) => {
        setClassicWarningState(on);
        void tokenStore.saveClassicWarning(on);
      },
      disconnect: () => {
        void tokenStore.clear();
        setLogin(null);
        setClassicWarningState(false);
        setToken(null);
      },
    }),
    [login, classicWarning],
  );

  if (token === undefined) return null; // loading the cached token

  return (
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        {token ? (
          <SessionContext.Provider value={session}>
            <MainApp token={token} />
          </SessionContext.Provider>
        ) : (
          <ConnectScreen
            onConnected={(newToken, remember, newLogin, classic) => {
              void tokenStore
                .save(newToken, remember)
                .then(() => tokenStore.saveLogin(newLogin))
                .then(() => tokenStore.saveClassicWarning(classic));
              setLogin(newLogin);
              setClassicWarningState(classic);
              setToken(newToken);
            }}
          />
        )}
        <Toaster />
      </TooltipProvider>
    </BrandProvider>
  );
}
