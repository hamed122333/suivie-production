import React from 'react';
import PropTypes from 'prop-types';
import './Card.css';

/**
 * Conteneur de surface (carte) avec en-tête et pied optionnels.
 *
 * @param {React.ReactNode} [header]
 * @param {React.ReactNode} [footer]
 * @param {'none'|'sm'|'md'} [padding='md']
 * @param {boolean} [interactive] Ajoute un état au survol (carte cliquable)
 */
function Card({ header, footer, padding = 'md', interactive = false, className = '', children, ...rest }) {
  return (
    <div
      className={`ui-card ui-card--pad-${padding} ${interactive ? 'ui-card--interactive' : ''} ${className}`.trim()}
      {...rest}
    >
      {header && <div className="ui-card__header">{header}</div>}
      <div className="ui-card__body">{children}</div>
      {footer && <div className="ui-card__footer">{footer}</div>}
    </div>
  );
}

Card.propTypes = {
  header: PropTypes.node,
  footer: PropTypes.node,
  padding: PropTypes.oneOf(['none', 'sm', 'md']),
  interactive: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node,
};

export default Card;
