import React, { useId } from 'react';
import PropTypes from 'prop-types';
import '../Input/Input.css';
import './Select.css';

/**
 * Liste déroulante avec label, erreur et accessibilité.
 * Les options peuvent être fournies via `options` ou en `children` (<option>).
 *
 * @param {Array<{value: string|number, label: string}>} [options]
 * @param {string} [placeholder] Ajoute une première option neutre désactivée
 */
const Select = React.forwardRef(function Select(
  { label, error, hint, id, options, placeholder, className = '', required = false, children, ...rest },
  ref
) {
  const generatedId = useId();
  const selectId = id || generatedId;
  const describedBy = error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined;

  return (
    <div className={`ui-field ${error ? 'ui-field--invalid' : ''} ${className}`.trim()}>
      {label && (
        <label className="ui-field__label" htmlFor={selectId}>
          {label}{required && <span className="ui-field__required" aria-hidden="true"> *</span>}
        </label>
      )}
      <div className="ui-select__wrap">
        <select
          ref={ref}
          id={selectId}
          className="ui-field__control ui-select__control"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          required={required}
          {...rest}
        >
          {placeholder && <option value="" disabled>{placeholder}</option>}
          {options
            ? options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)
            : children}
        </select>
        <span className="ui-select__chevron" aria-hidden="true">▾</span>
      </div>
      {error
        ? <span id={`${selectId}-error`} className="ui-field__error">{error}</span>
        : hint ? <span id={`${selectId}-hint`} className="ui-field__hint">{hint}</span> : null}
    </div>
  );
});

Select.propTypes = {
  label: PropTypes.string,
  error: PropTypes.string,
  hint: PropTypes.string,
  id: PropTypes.string,
  options: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    label: PropTypes.string,
  })),
  placeholder: PropTypes.string,
  className: PropTypes.string,
  required: PropTypes.bool,
  children: PropTypes.node,
};

export default Select;
