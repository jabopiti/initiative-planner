import { useState, type ReactNode } from 'react';
import { useBrand } from '../state/BrandContext';
import { Button } from '@/components/ui/button';

/**
 * The four steps of creating a token (§5.10), shared by the Connect screen and the read-only banner's
 * "Show steps". `first` is the step that opens GitHub's token page, which each screen words and styles itself.
 */
export function TokenSteps({ first, className = '' }: { first: ReactNode; className?: string }) {
  const brand = useBrand();
  const [copied, setCopied] = useState(false);
  const repoLabel = `${brand.github.owner}/${brand.github.repo}`;

  async function copyRepoName() {
    try {
      await navigator.clipboard.writeText(repoLabel);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the name is also shown as plain text.
    }
  }

  return (
    <ol className={`m-0 flex list-decimal flex-col gap-3 pl-5 marker:font-medium marker:text-text-primary ${className}`}>
      <li>{first}</li>
      <li>Set the expiry to 1 year.</li>
      <li>
        Under Repository access, choose &ldquo;Only select repositories&rdquo; and pick{' '}
        <code className="rounded bg-surface-subtle px-1.5 py-0.5">{repoLabel}</code>{' '}
        <Button type="button" variant="outline" size="xs" onClick={copyRepoName} aria-label={`Copy ${repoLabel}`}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <span className="sr-only" aria-live="polite">
          {copied ? 'Copied to clipboard' : ''}
        </span>
      </li>
      <li>Under Permissions, add Contents and set it to Read and write. Leave everything else at No access.</li>
    </ol>
  );
}
