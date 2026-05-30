import React from 'react';
import { render, screen } from '@testing-library/react';
import EmptyState from './EmptyState';

describe('EmptyState', () => {
  test('affiche le titre', () => {
    render(<EmptyState title="Aucune commande" />);
    expect(screen.getByText('Aucune commande')).toBeInTheDocument();
  });

  test('affiche description et action quand fournies', () => {
    render(
      <EmptyState
        title="Vide"
        description="Importez un fichier"
        action={<button>Importer</button>}
      />
    );
    expect(screen.getByText('Importez un fichier')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importer' })).toBeInTheDocument();
  });
});
