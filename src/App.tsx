import { useEffect, useState } from 'react';
import { tokenStore } from './auth/tokenStore';
import { defaultBrandPack } from './brand/defaultBrand';
import { BrandProvider } from './state/BrandContext';
import { RepositoryProvider, useRepositoryState } from './state/DataContext';
import { ConnectScreen } from './ui/ConnectScreen';
import { TopBar } from './ui/TopBar';
import { ConflictBanner } from './ui/ConflictBanner';
import { PortfolioBoard } from './ui/PortfolioBoard';
import { TeamsOverview } from './ui/TeamsOverview';
import { InitiativeDetail } from './ui/InitiativeDetail';
import { NewInitiativeDraft } from './ui/NewInitiativeDraft';
import { PeopleOverview } from './ui/PeopleOverview';
import { TeamDetail } from './ui/TeamDetail';
import { Placeholder } from './ui/Placeholder';
import { useHashRoute } from './router/useHashRoute';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

function Screen({ route }: { route: string }) {
  const { status, readOnly } = useRepositoryState();
  // Until the dataset has loaded every list would read as empty and every id as missing. If it cannot
  // load, the screens stay away and the reason is shown instead of "No teams yet".
  if (status === 'loading') {
    return readOnly ? (
      <div className="max-w-[720px] p-8">
        <p role="alert">{readOnly.message}</p>
      </div>
    ) : null;
  }
  if (route === '/portfolio') return <PortfolioBoard />;
  if (route === '/teams') return <TeamsOverview />;
  if (route.startsWith('/teams/')) return <TeamDetail key={route} id={route.slice('/teams/'.length)} />;
  if (route === '/initiatives/new') return <NewInitiativeDraft />;
  if (route.startsWith('/initiatives/')) {
    // A Needs attention strip link (§5.2, §8.5) carries where to scroll and focus as a query suffix on the
    // hash path, since the hash router (useHashRoute.ts) otherwise treats the whole path as one opaque route.
    const rest = route.slice('/initiatives/'.length);
    const [id, query = ''] = rest.split('?');
    const params = new URLSearchParams(query);
    return <InitiativeDetail id={id} focus={params.get('focus')} openPhaseId={params.get('openPhase')} />;
  }
  if (route === '/initiatives') {
    return <Placeholder title="Initiatives" note="The full initiatives table isn't built yet." />;
  }
  if (route === '/people') return <PeopleOverview />;
  if (route === '/settings') return <Placeholder title="Settings" note="Settings isn't built yet." />;
  return <PortfolioBoard />;
}

function MainApp({ token }: { token: string }) {
  const route = useHashRoute();
  return (
    <RepositoryProvider token={token}>
      <TopBar route={route} />
      <ConflictBanner />
      <Screen route={route} />
    </RepositoryProvider>
  );
}

export function App() {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    tokenStore
      .load()
      .catch(() => null) // browser storage unavailable: connect again rather than show nothing
      .then((stored) => {
        if (!cancelled) setToken(stored);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (token === undefined) return null; // loading the cached token

  return (
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        {token ? (
          <MainApp token={token} />
        ) : (
          <ConnectScreen
            onConnected={(newToken, remember) => {
              void tokenStore.save(newToken, remember);
              setToken(newToken);
            }}
          />
        )}
        <Toaster />
      </TooltipProvider>
    </BrandProvider>
  );
}
