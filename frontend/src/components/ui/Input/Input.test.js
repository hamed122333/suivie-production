import React from 'react';
import { render, screen } from '@testing-library/react';
import Input from './Input';

describe('Input', () => {
  test('associe le label au champ', () => {
    render(<Input label="Client" />);
    expect(screen.getByLabelText('Client')).toBeInTheDocument();
  });

  test('affiche l\'erreur et marque aria-invalid', () => {
    render(<Input label="Email" error="Email requis" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Email requis')).toBeInTheDocument();
  });

  test('affiche un hint quand pas d\'erreur', () => {
    render(<Input label="Code" hint="Format VL000001" />);
    expect(screen.getByText('Format VL000001')).toBeInTheDocument();
  });

  test('marque le champ requis', () => {
    render(<Input label="Nom" required />);
    expect(screen.getByLabelText(/Nom/)).toBeRequired();
  });
});
