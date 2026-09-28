export interface CopyTableData {
  headers: string[];
  rows: string[][];
  /** Indices of columns holding numbers, amounts or percentages — never prefixed by the formula-safety rule below. */
  numericColumns: number[];
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Tabs and line breaks inside a value would break the cell grid in a spreadsheet. */
const flatten = (s: string) => s.replace(/[\t\r\n]+/g, ' ');

/** OWASP's CSV-injection character set: a spreadsheet reads a cell starting with any of these as a formula. */
const FORMULA_LEADING_CHAR = /^[=+\-@]/;

/**
 * A leading tab or carriage return is dangerous too, but `flatten` turns it into a space before
 * any check on the flattened string would see it — so this checks the cell as given, first.
 */
const startsWithTabOrCr = (s: string) => s[0] === '\t' || s[0] === '\r';

/** A text cell that a spreadsheet could misread as a formula gets a leading apostrophe, so it pastes as text (§9.2, §10.9). */
function guardCell(cell: string, isNumeric: boolean): string {
  const flattened = flatten(cell);
  if (isNumeric) return flattened;
  return startsWithTabOrCr(cell) || FORMULA_LEADING_CHAR.test(flattened) ? `'${flattened}` : flattened;
}

export function tableToText({ headers, rows, numericColumns }: CopyTableData): string {
  const numeric = new Set(numericColumns);
  const guardRow = (r: string[]) => r.map((c, i) => guardCell(c, numeric.has(i))).join('\t');
  return [headers, ...rows].map(guardRow).join('\n');
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
