import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Button from './Button';

describe('Button', () => {
  test('affiche son contenu', () => {
    render(<Button>Valider</Button>);
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument();
  });

  test('applique la variante et la taille', () => {
    render(<Button variant="danger" size="lg">X</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveClass('ui-btn--danger');
    expect(btn).toHaveClass('ui-btn--lg');
  });

  test('déclenche onClick', () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('état loading : désactivé + aria-busy + non cliquable', () => {
    const onClick = jest.fn();
    render(<Button loading onClick={onClick}>Envoi</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  test('disabled empêche le clic', () => {
    const onClick = jest.fn();
    render(<Button disabled onClick={onClick}>Off</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  test('type submit transmis', () => {
    render(<Button type="submit">OK</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });
});
