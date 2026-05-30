import React, { useId } from 'react';
import PropTypes from 'prop-types';
import './Input.css';

/**
 * Champ de saisie avec label, message d'erreur et accessibilité intégrés.
 *
 * @param {string} [label]
 * @param {string} [error]   Message d'erreur (passe le champ en état invalide)
 * @param {string} [hint]    Texte d'aide secondaire
 */
const Input = React.forwardRef(function Input(
  { label, error, hint, id, type = 'text', className = '', required = false, ...rest },
  ref
) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={`ui-field ${error ? 'ui-field--invalid' : ''} ${className}`.trim()}>
      {label && (
        <label className="ui-field__label" htmlFor={inputId}>
          {label}{required && <span className="ui-field__required" aria-hidden="true"> *</span>}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        type={type}
        className="ui-field__control"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        required={required}
        {...rest}
      />
      {error
        ? <span id={`${inputId}-error`} className="ui-field__error">{error}</span>
        : hint ? <span id={`${inputId}-hint`} className="ui-field__hint">{hint}</span> : null}
    </div>
  );
});

Input.propTypes = {
  label: PropTypes.string,
  error: PropTypes.string,
  hint: PropTypes.string,
  id: PropTypes.string,
  type: PropTypes.string,
  className: PropTypes.string,
  required: PropTypes.bool,
};

export default Input;
