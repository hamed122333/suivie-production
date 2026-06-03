import React, { useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
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
 * - role="dialog" + aria-modal + focus initial
 * - bloque le scroll de l'arrière-plan tant qu'elle est ouverte
 *
 * @param {boolean} isOpen
 * @param {() => void} onClose
 * @param {string} [title]
 * @param {'sm'|'md'|'lg'|'xl'} [size='md']
 * @param {React.ReactNode} [footer]
 * @param {boolean} [closeOnOverlay=true]
 * @param {boolean} [closeOnEsc=true]
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
  const titleId = useRef(`ui-modal-${Math.random().toString(36).slice(2, 9)}`).current;

  const handleKeyDown = useCallback(
    (e) => {
      if (closeOnEsc && e.key === 'Escape') onClose?.();
    },
    [closeOnEsc, onClose]
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus initial sur la boîte de dialogue
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="ui-modal__overlay"
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose?.();
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
            <button type="button" className="ui-modal__close" onClick={onClose} aria-label="Fermer">
              Fermer
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
