import { useEffect, useMemo, useState } from 'react';
import { tokenStore } from './auth/tokenStore';
import { defaultBrandPack } from './brand/defaultBrand';
import { BrandProvider } from './state/BrandContext';
import { RepositoryProvider, useRepositoryState } from './state/DataContext';
import { NeedsAttentionProvider } from './state/NeedsAttentionContext';
import { SessionContext, type Session } from './state/SessionContext';
import { ConnectScreen } from './ui/ConnectScreen';
import { TopBar } from './ui/TopBar';
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

function Screen({ route }: { route: string }) {
  const { status } = useRepositoryState();
  // Until the dataset has loaded every list would read as empty and every id as missing, so no screen shows. If it
  // cannot load, the read-only banner above carries the reason (§3, §9.9), once.
  if (status === 'loading') return null;
  if (route === '/portfolio') return <PortfolioBoard />;
  if (route === '/teams') return <TeamsOverview />;
  if (route.startsWith('/teams/')) return <TeamDetail key={route} id={route.slice('/teams/'.length)} />;
  if (route === '/initiatives/new' || route.startsWith('/initiatives/new?')) {
    return <NewInitiativeDraft presetTeamId={new URLSearchParams(route.split('?')[1]).get('team') ?? undefined} />;
  }
  if (route.startsWith('/initiatives/')) {
    // A Needs attention strip link (§5.2, §8.5) carries where to scroll and focus as a query suffix on the
    // hash path, since the hash router (useHashRoute.ts) otherwise treats the whole path as one opaque route.
    const rest = route.slice('/initiatives/'.length);
    const [id, query = ''] = rest.split('?');
    const params = new URLSearchParams(query);
    return <InitiativeDetail id={id} focus={params.get('focus')} openPhaseId={params.get('openPhase')} />;
  }
  if (route === '/initiatives') return <InitiativesTable />;
  if (route === '/people') return <PeopleOverview />;
  if (route === '/settings') return <SettingsPage section={DEFAULT_SECTION} />;
  if (route.startsWith('/settings/')) return <SettingsPage section={route.slice('/settings/'.length)} />;
  return <PortfolioBoard />;
}

function MainApp({ token }: { token: string }) {
  const route = useHashRoute();
  return (
    <RepositoryProvider token={token} keepTrackedYears>
      <NeedsAttentionProvider>
        <ConflictUiProvider>
          <TopBar route={route} />
          <ReadOnlyBanner />
          <ConflictBanner />
          <Screen route={route} />
        </ConflictUiProvider>
      </NeedsAttentionProvider>
    </RepositoryProvider>
  );
}

export function App() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [login, setLogin] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Storage unavailable: connect again rather than show nothing.
    Promise.all([tokenStore.load().catch(() => null), tokenStore.loadLogin().catch(() => null)]).then(([stored, storedLogin]) => {
      if (cancelled) return;
      setLogin(stored ? storedLogin : null);
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
      disconnect: () => {
        void tokenStore.clear();
        setLogin(null);
        setToken(null);
      },
    }),
    [login],
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
            onConnected={(newToken, remember, newLogin) => {
              void tokenStore.save(newToken, remember).then(() => tokenStore.saveLogin(newLogin));
              setLogin(newLogin);
              setToken(newToken);
            }}
          />
        )}
        <Toaster />
      </TooltipProvider>
    </BrandProvider>
  );
}
