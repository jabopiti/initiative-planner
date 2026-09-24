import { Copy } from 'lucide-react';
import { toast } from 'sonner';
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

/** Icon-only Copy button (§9.2) with a "Copy" tooltip and a toast on success or failure. */
export function CopyButton({ getData, noun, label = 'Copy' }: Props) {
  async function handleCopy() {
    const data = getData();
    try {
      await copyTable(data);
      const n = data.rows.length;
      toast.success(`Copied ${n} ${n === 1 ? noun[0] : noun[1]}`);
    } catch {
      toast.error("Couldn't copy. Your browser blocked clipboard access.");
    }
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label={label} onClick={() => void handleCopy()}>
          <Copy size={18} aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Copy</TooltipContent>
    </Tooltip>
  );
}
