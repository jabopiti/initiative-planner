export interface CopyTableData {
  headers: string[];
  rows: string[][];
  /** Summary rows after a blank row, such as the Portfolio's key metrics (§5.2); not counted as copied rows. */
  footerRows?: string[][];
  /** Indices of columns holding numbers, amounts or percentages — never prefixed by the formula-safety rule below. */
  numericColumns: number[];
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Tabs and line breaks inside a value would break the cell grid in a spreadsheet. */
const flatten = (s: string) => s.replace(/[\t\r\n]+/g, ' ');

/** OWASP's CSV-injection character set: a spreadsheet reads a cell starting with any of these as a formula. Checked on the cell as given — before `flatten` would turn a leading tab, carriage return or line feed into a harmless-looking space. */
const RISKY_LEADING_CHAR = /^[\t\r\n=+\-@]/;

/** A text cell that a spreadsheet could misread as a formula gets a leading apostrophe, so it pastes as text (§9.2, §10.9). */
function guardCell(cell: string, isNumeric: boolean): string {
  const flattened = flatten(cell);
  return !isNumeric && RISKY_LEADING_CHAR.test(cell) ? `'${flattened}` : flattened;
}

export function tableToText({ headers, rows, footerRows, numericColumns }: CopyTableData): string {
  const guardHeader = (r: string[]) => r.map((c) => guardCell(c, false)).join('\t');
  const guardRow = (r: string[]) => r.map((c, i) => guardCell(c, numericColumns.includes(i))).join('\t');
  const footer = footerRows?.length ? ['', ...footerRows.map(guardRow)] : [];
  return [guardHeader(headers), ...rows.map(guardRow), ...footer].join('\n');
}

export function tableToHtml({ headers, rows, footerRows }: CopyTableData): string {
  const cells = (tag: string, r: string[]) => `<tr>${r.map((c) => `<${tag}>${escapeHtml(c)}</${tag}>`).join('')}</tr>`;
  const footer = footerRows?.length ? [headers.map(() => ''), ...footerRows].map((r) => cells('td', r)).join('') : '';
  return `<table><thead>${cells('th', headers)}</thead><tbody>${rows.map((r) => cells('td', r)).join('')}${footer}</tbody></table>`;
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
