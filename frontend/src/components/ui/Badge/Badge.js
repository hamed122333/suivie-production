import React from 'react';
import PropTypes from 'prop-types';
import './Badge.css';

/**
 * Pastille / étiquette de statut.
 *
 * @param {'neutral'|'primary'|'success'|'warning'|'danger'} [tone='neutral']
 * @param {boolean} [dot] Affiche une pastille colorée avant le texte
 */
function Badge({ tone = 'neutral', dot = false, className = '', children, ...rest }) {
  return (
    <span className={`ui-badge ui-badge--${tone} ${className}`.trim()} {...rest}>
      {dot && <span className="ui-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

Badge.propTypes = {
  tone: PropTypes.oneOf(['neutral', 'primary', 'success', 'warning', 'danger']),
  dot: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node,
};

export default Badge;
