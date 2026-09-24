import { useEffect, useState } from 'react';
import { tokenStore } from './auth/tokenStore';
import { defaultBrandPack } from './brand/defaultBrand';
import { BrandProvider } from './state/BrandContext';
import { RepositoryProvider } from './state/DataContext';
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
  if (route === '/portfolio') return <PortfolioBoard />;
  if (route === '/teams') return <TeamsOverview />;
  if (route.startsWith('/teams/')) return <TeamDetail id={route.slice('/teams/'.length)} />;
  if (route === '/initiatives/new') return <NewInitiativeDraft />;
  if (route.startsWith('/initiatives/')) return <InitiativeDetail id={route.slice('/initiatives/'.length)} />;
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
    void tokenStore.load().then((stored) => {
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
