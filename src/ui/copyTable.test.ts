import { describe, expect, it } from 'vitest';
import { tableToHtml, tableToText, type CopyTableData } from './copyTable';

describe('tableToText', () => {
  it('prefixes text cells that look like formulas with an apostrophe', () => {
    const data: CopyTableData = {
      headers: ['Label'],
      rows: [['=Hosting'], ['+1 contractor'], ['-legacy'], ['@Mara']],
      numericColumns: [],
    };
    expect(tableToText(data)).toBe(["Label", "'=Hosting", "'+1 contractor", "'-legacy", "'@Mara"].join('\n'));
  });

  it('leaves numeric-column cells unchanged even when they start with a risky character', () => {
    const data: CopyTableData = {
      headers: ['Metric', 'Amount'],
      rows: [
        ['Deviation', '−€1,300'],
        ['Deviation', '+€9,200'],
        ['Change', '-5%'],
      ],
      numericColumns: [1],
    };
    expect(tableToText(data)).toBe(['Metric\tAmount', 'Deviation\t−€1,300', 'Deviation\t+€9,200', 'Change\t-5%'].join('\n'));
  });

  it('prefixes a text cell that starts with a tab or carriage return, even though flatten would otherwise hide it', () => {
    const data: CopyTableData = { headers: ['Label'], rows: [['\t=Hosting'], ['\rNote']], numericColumns: [] };
    expect(tableToText(data)).toBe(["Label", "' =Hosting", "' Note"].join('\n'));
  });

  it('does not prefix ordinary text', () => {
    const data: CopyTableData = { headers: ['Name'], rows: [['Mara'], ['Payments API']], numericColumns: [] };
    expect(tableToText(data)).toBe(['Name', 'Mara', 'Payments API'].join('\n'));
  });
});

describe('tableToHtml', () => {
  it('does not prefix any cell, numeric or not', () => {
    const data: CopyTableData = { headers: ['Label'], rows: [['=Hosting']], numericColumns: [] };
    expect(tableToHtml(data)).not.toContain("'=Hosting");
    expect(tableToHtml(data)).toContain('<td>=Hosting</td>');
  });
});
