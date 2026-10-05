import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn with the theme tokens', () => {
  it('keeps a type-scale size beside a text colour', () => {
    expect(cn('text-label text-text-primary')).toBe('text-label text-text-primary');
  });

  it('lets a later size or max width replace an earlier one', () => {
    expect(cn('text-label', 'text-body')).toBe('text-body');
    expect(cn('max-w-page', 'max-w-[10px]')).toBe('max-w-[10px]');
  });
});
