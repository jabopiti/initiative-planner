import { Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { copyTable, type CopyTableData } from './copyTable';

interface Props {
  /** Builds the table as currently shown: filter and sort applied. */
  getData: () => CopyTableData;
  /** Singular and plural noun for the confirmation, e.g. ['person', 'people']. */
  noun: [string, string];
  /** The section whose table it copies, when it sits in a section header rather than the page's toolbar row: named for screen readers as "Copy table: <section>". */
  section?: string;
  /** Icon only, with this name and tooltip, inside a key-figure tile where a labelled button would compete with the figure (§5.4). */
  iconLabel?: string;
}

/**
 * The Copy table button (§9.2): a labelled ghost button — or an icon-only one in a key-figure tile — with text beside
 * it on success or failure (§9.9).
 */
export function CopyButton({ getData, noun, section, iconLabel }: Props) {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  // Success is confirmed for a few seconds; a failure stays until the next copy.
  useEffect(() => {
    if (!message || message.error) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  async function handleCopy() {
    const data = getData();
    try {
      await copyTable(data);
      const n = data.rows.length;
      setMessage({ text: `Copied ${n} ${n === 1 ? noun[0] : noun[1]}`, error: false });
    } catch {
      setMessage({ text: "Couldn't copy. Your browser blocked clipboard access.", error: true });
    }
  }
  return (
    <>
      {message && (
        <span role={message.error ? 'alert' : 'status'} className={`text-body ${message.error ? 'text-alarm-text' : 'text-text-secondary'}`}>
          {message.text}
        </span>
      )}
      {iconLabel ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={iconLabel} onClick={() => void handleCopy()}>
              <Copy size={18} aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{iconLabel}</TooltipContent>
        </Tooltip>
      ) : (
        // The accessible name starts with the visible label, so speech input can say what it sees (WCAG 2.5.3).
        <Button type="button" variant="ghost" size="sm" aria-label={section ? `Copy table: ${section}` : undefined} onClick={() => void handleCopy()}>
          <Copy size={16} aria-hidden="true" />
          Copy table
        </Button>
      )}
    </>
  );
}
