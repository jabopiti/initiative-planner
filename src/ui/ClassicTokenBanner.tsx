import { tokenCreationUrl } from '../auth/tokenCreationUrl';
import { useBrand } from '../state/BrandContext';
import { useSession } from '../state/SessionContext';
import { DismissibleWarning } from './DismissibleWarning';

/**
 * The classic-token warning (§5.10): a classic token reaches all of the user's repositories, so after it connects
 * this banner sits under the top bar, with a link to create a fine-grained one, until it is dismissed or the token
 * is replaced. It survives a reload with the token (`tokenStore.loadClassicWarning`).
 */
export function ClassicTokenBanner() {
  const brand = useBrand();
  const session = useSession();
  if (!session.classicWarning) return null;
  return (
    <DismissibleWarning onDismiss={() => session.setClassicWarning(false)}>
      {session.login ? `Connected as ${session.login} — ` : ''}a classic token reaches all your repositories.{' '}
      <a href={tokenCreationUrl(brand.github, brand.productName)} target="_blank" rel="noreferrer" className="underline">
        Create a fine-grained one<span className="sr-only"> (opens in a new tab)</span>
      </a>
      .
    </DismissibleWarning>
  );
}
