export interface CopyTableData {
  headers: string[];
  rows: string[][];
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Tabs and line breaks inside a value would break the cell grid in a spreadsheet. */
const flatten = (s: string) => s.replace(/[\t\r\n]+/g, ' ');

export function tableToText({ headers, rows }: CopyTableData): string {
  return [headers, ...rows].map((r) => r.map(flatten).join('\t')).join('\n');
}

export function tableToHtml({ headers, rows }: CopyTableData): string {
  const cells = (tag: string, r: string[]) => `<tr>${r.map((c) => `<${tag}>${escapeHtml(c)}</${tag}>`).join('')}</tr>`;
  return `<table><thead>${cells('th', headers)}</thead><tbody>${rows.map((r) => cells('td', r)).join('')}</tbody></table>`;
}

/** Writes a table to the clipboard as plain text and rich HTML (§9.2). Rejects if the browser refuses. */
export async function copyTable(data: CopyTableData): Promise<void> {
  const text = tableToText(data);
  const html = tableToHtml(data);
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      }),
    ]);
    return;
  }
  await navigator.clipboard.writeText(text);
}
