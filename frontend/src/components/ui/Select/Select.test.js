import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Select from './Select';

const OPTIONS = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
];

describe('Select', () => {
  test('rend les options fournies via props', () => {
    render(<Select label="Choix" options={OPTIONS} onChange={() => {}} value="a" />);
    expect(screen.getByRole('option', { name: 'Option A' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Option B' })).toBeInTheDocument();
  });

  test('placeholder ajoute une option désactivée', () => {
    render(<Select label="Choix" placeholder="Sélectionner…" options={OPTIONS} onChange={() => {}} value="" />);
    const ph = screen.getByRole('option', { name: 'Sélectionner…' });
    expect(ph).toBeDisabled();
  });

  test('déclenche onChange', () => {
    const onChange = jest.fn();
    render(<Select label="Choix" options={OPTIONS} value="a" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Choix'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalled();
  });

  test('état erreur : aria-invalid + message', () => {
    render(<Select label="Choix" error="Obligatoire" options={OPTIONS} value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Choix')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Obligatoire')).toBeInTheDocument();
  });
});
