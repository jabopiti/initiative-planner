import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { BrandProvider } from '../state/BrandContext';
import { AboutSection } from './AboutSection';

afterEach(cleanup);

describe('Settings → About (§5.9)', () => {
  it('shows the product, build version, schema version and process identity', () => {
    render(
      <BrandProvider brand={defaultBrandPack}>
        <AboutSection />
      </BrandProvider>,
    );
    expect(screen.getByText('Initiative Planner')).toBeInTheDocument();
    expect(screen.getByText('Build version').nextSibling).toHaveTextContent(/^\d+\.\d+\.\d+/);
    expect(screen.getByText('Schema version').nextSibling).toHaveTextContent('1');
    expect(screen.getByText('initiative-planner-core, structure version 1')).toBeInTheDocument();
  });
});
