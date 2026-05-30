import React from 'react';
import { render, screen } from '@testing-library/react';
import Badge from './Badge';

describe('Badge', () => {
  test('rend le texte', () => {
    render(<Badge>Prêt</Badge>);
    expect(screen.getByText('Prêt')).toBeInTheDocument();
  });

  test('applique la tonalité', () => {
    render(<Badge tone="success">OK</Badge>);
    expect(screen.getByText('OK')).toHaveClass('ui-badge--success');
  });

  test('tonalité par défaut = neutral', () => {
    render(<Badge>N</Badge>);
    expect(screen.getByText('N')).toHaveClass('ui-badge--neutral');
  });
});
