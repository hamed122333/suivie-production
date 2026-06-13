import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { IconClose } from '../icons';
import './Modal.css';

const SIZE_CLASS = {
  sm: 'ui-modal--sm',
  md: 'ui-modal--md',
  lg: 'ui-modal--lg',
  xl: 'ui-modal--xl',
};

/**
 * Modale accessible et réutilisable.
 * - Ferme sur Échap et clic sur l'arrière-plan (configurable)
 * - role="dialog" + aria-modal + focus initial à l'ouverture uniquement
 * - bloque le scroll de l'arrière-plan tant qu'elle est ouverte
 */
function Modal({
  isOpen,
  onClose,
  title,
  size = 'md',
  footer = null,
  closeOnOverlay = true,
  closeOnEsc = true,
  className = '',
  children,
}) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useRef(`ui-modal-${Math.random().toString(36).slice(2, 9)}`).current;

  onCloseRef.current = onClose;

  // Écoute Échap — onClose via ref pour ne pas ré-abonner à chaque render parent.
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (e) => {
      if (closeOnEsc && e.key === 'Escape') onCloseRef.current?.();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEsc]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Focus initial une seule fois à l'ouverture — ne pas voler le focus des champs à l'intérieur.
  useEffect(() => {
    if (!isOpen) return;
    dialogRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="ui-modal__overlay"
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onCloseRef.current?.();
      }}
    >
      <div
        ref={dialogRef}
        className={`ui-modal ${SIZE_CLASS[size] || SIZE_CLASS.md} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        {(title || onClose) && (
          <div className="ui-modal__header">
            {title && <h3 id={titleId} className="ui-modal__title">{title}</h3>}
            <button type="button" className="ui-modal__close" onClick={() => onCloseRef.current?.()} aria-label="Fermer" title="Fermer">
              <IconClose />
            </button>
          </div>
        )}

        <div className="ui-modal__body">{children}</div>

        {footer && <div className="ui-modal__footer">{footer}</div>}
      </div>
    </div>
  );
}

Modal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string,
  size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl']),
  footer: PropTypes.node,
  closeOnOverlay: PropTypes.bool,
  closeOnEsc: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node,
};

export default Modal;
