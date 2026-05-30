import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from './Modal';

describe('Modal', () => {
  test('ne rend rien quand isOpen=false', () => {
    render(<Modal isOpen={false} onClose={() => {}} title="Titre">Contenu</Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('rend le contenu et le titre quand ouverte', () => {
    render(<Modal isOpen onClose={() => {}} title="Confirmation">Corps</Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Confirmation')).toBeInTheDocument();
    expect(screen.getByText('Corps')).toBeInTheDocument();
  });

  test('ferme via le bouton ✕', () => {
    const onClose = jest.fn();
    render(<Modal isOpen onClose={onClose} title="T">x</Modal>);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('ferme sur Échap', () => {
    const onClose = jest.fn();
    render(<Modal isOpen onClose={onClose} title="T">x</Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('closeOnEsc=false : ignore Échap', () => {
    const onClose = jest.fn();
    render(<Modal isOpen onClose={onClose} closeOnEsc={false} title="T">x</Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  test('clic sur l\'overlay ferme la modale', () => {
    const onClose = jest.fn();
    render(<Modal isOpen onClose={onClose} title="T">x</Modal>);
    // L'overlay est le parent du dialog
    const overlay = screen.getByRole('dialog').parentElement;
    fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('affiche un footer si fourni', () => {
    render(<Modal isOpen onClose={() => {}} title="T" footer={<span>pied</span>}>x</Modal>);
    expect(screen.getByText('pied')).toBeInTheDocument();
  });
});
