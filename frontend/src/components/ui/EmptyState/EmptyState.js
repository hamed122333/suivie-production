import React from 'react';
import PropTypes from 'prop-types';
import './EmptyState.css';

/**
 * État vide réutilisable (aucune donnée, aucun résultat de recherche, etc.).
 *
 * @param {React.ReactNode} [icon]
 * @param {string} title
 * @param {string} [description]
 * @param {React.ReactNode} [action] Bouton ou lien d'action
 */
function EmptyState({ icon, title, description, action, className = '' }) {
  return (
    <div className={`ui-empty ${className}`.trim()}>
      {icon && <div className="ui-empty__icon" aria-hidden="true">{icon}</div>}
      <strong className="ui-empty__title">{title}</strong>
      {description && <p className="ui-empty__desc">{description}</p>}
      {action && <div className="ui-empty__action">{action}</div>}
    </div>
  );
}

EmptyState.propTypes = {
  icon: PropTypes.node,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  action: PropTypes.node,
  className: PropTypes.string,
};

export default EmptyState;
