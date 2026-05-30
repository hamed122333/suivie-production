import React from 'react';
import PropTypes from 'prop-types';
import './Loader.css';

/**
 * Indicateur de chargement.
 *
 * @param {'sm'|'md'|'lg'} [size='md']
 * @param {string} [message]   Texte affiché sous le spinner
 * @param {boolean} [fullPage] Centre le loader sur toute la zone disponible
 */
function Loader({ size = 'md', message, fullPage = false, className = '' }) {
  return (
    <div
      className={`ui-loader ${fullPage ? 'ui-loader--full' : ''} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <span className={`ui-loader__spinner ui-loader__spinner--${size}`} aria-hidden="true" />
      {message && <p className="ui-loader__message">{message}</p>}
      <span className="ui-loader__sr">Chargement…</span>
    </div>
  );
}

Loader.propTypes = {
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  message: PropTypes.string,
  fullPage: PropTypes.bool,
  className: PropTypes.string,
};

export default Loader;
