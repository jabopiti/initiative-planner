import { useContext, useState, type ClipboardEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
import { tokenStore } from '../auth/tokenStore';
import { checkToken, repoLabel, TOKEN_CHECK_MESSAGES } from '../auth/validateToken';
import { useBrand } from '../state/BrandContext';
import { useRepository } from '../state/DataContext';
import { SessionContext } from '../state/SessionContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Replaces the token in place (§3 Sync failures, §5.9 Connection): a pasted token is checked at once, typing
 * needs Replace or Enter. A token that passes is saved with the earlier Remember me choice and swapped into the
 * running repository, so no edit is lost (`Repository.setToken`). Otherwise §5.10's message shows under the field.
 */
export function ReplaceTokenField({ onReplaced }: { onReplaced?: () => void }) {
  const brand = useBrand();
  const repository = useRepository();
  const session = useContext(SessionContext);
  const [value, setValue] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function replace(raw: string) {
    const token = raw.trim();
    if (!token || checking) return;
    setChecking(true);
    setError(null);
    const result = await checkToken(brand.github, token);
    setChecking(false);
    if (result.outcome !== 'works' && result.outcome !== 'classic-warning') {
      setError(TOKEN_CHECK_MESSAGES[result.outcome]({ repo: repoLabel(brand.github) }));
      return;
    }
    await tokenStore.save(token, await tokenStore.remembered());
    if (session) session.rememberLogin(result.login);
    else await tokenStore.saveLogin(result.login);
    // The warning follows the new token: raised for a classic one, gone for a fine-grained one (§5.10).
    if (session) session.setClassicWarning(result.outcome === 'classic-warning');
    else await tokenStore.saveClassicWarning(result.outcome === 'classic-warning');
    setValue('');
    repository.setToken(token);
    onReplaced?.();
    toast.success(TOKEN_CHECK_MESSAGES[result.outcome]({ login: result.login, repo: repoLabel(brand.github) }));
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text');
    if (!pasted.trim()) return;
    event.preventDefault();
    setValue(pasted.trim());
    void replace(pasted);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void replace(value);
  }

  return (
    <form className="flex flex-col gap-1" onSubmit={onSubmit}>
      <div className="flex items-center gap-2">
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-label="New GitHub token"
          aria-invalid={error ? true : undefined}
          placeholder="Paste a new token"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onPaste={onPaste}
          className="w-[340px] max-w-full bg-surface-card text-text-primary"
        />
        <Button type="submit" size="sm" disabled={checking || !value.trim()}>
          {checking ? 'Checking…' : 'Replace'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="m-0 text-alarm-text">
          {error}
        </p>
      )}
    </form>
  );
}
