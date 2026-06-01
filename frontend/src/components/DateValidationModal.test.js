import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DateValidationModal from './DateValidationModal';

const task = { id: 1, title: 'Commande X', planned_date: '2026-05-30' };

describe('DateValidationModal', () => {
  test('affiche la date actuelle et le titre', () => {
    render(<DateValidationModal task={task} onClose={() => {}} onValidate={() => {}} onPropose={() => {}} />);
    expect(screen.getByText(/Commande X/)).toBeInTheDocument();
    expect(screen.getByText(/30\/05\/2026/)).toBeInTheDocument();
  });

  test('« Valider la date » déclenche onValidate', () => {
    const onValidate = jest.fn();
    render(<DateValidationModal task={task} onClose={() => {}} onValidate={onValidate} onPropose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Valider la date/ }));
    expect(onValidate).toHaveBeenCalledTimes(1);
  });

  test('le mode proposition envoie la nouvelle date via onPropose', () => {
    const onPropose = jest.fn();
    render(<DateValidationModal task={task} onClose={() => {}} onValidate={() => {}} onPropose={onPropose} />);
    fireEvent.click(screen.getByRole('button', { name: /Proposer une autre date/ }));
    const input = screen.getByLabelText(/Nouvelle date proposée/);
    fireEvent.change(input, { target: { value: '2026-06-15' } });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer la proposition/ }));
    expect(onPropose).toHaveBeenCalledWith('2026-06-15');
  });

  test('ne rend rien sans task', () => {
    const { container } = render(
      <DateValidationModal task={null} onClose={() => {}} onValidate={() => {}} onPropose={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
