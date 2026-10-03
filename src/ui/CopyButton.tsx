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
  /** Accessible name, when a page has more than one Copy button. */
  label?: string;
}

/** Icon-only Copy button (§9.2) with a "Copy" tooltip and text beside it on success or failure (§9.9). */
export function CopyButton({ getData, noun, label = 'Copy' }: Props) {
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
      <span role={message.error ? 'alert' : 'status'} className={`text-sm ${message.error ? 'text-alarm-text' : 'text-text-secondary'}`}>
        {message.text}
      </span>
    )}
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label={label} onClick={() => void handleCopy()}>
          <Copy size={18} aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
    </>
  );
}
