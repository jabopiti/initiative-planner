import { commitHistoryUrl } from '../auth/tokenCreationUrl';
import { useBrand } from '../state/BrandContext';

/** "Open commit history" beside a "Dataset damaged" message (§3): where the owner restores an earlier version. */
export function CommitHistoryLink() {
  const brand = useBrand();
  return (
    <a href={commitHistoryUrl(brand.github)} target="_blank" rel="noreferrer" className="underline">
      Open commit history<span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
