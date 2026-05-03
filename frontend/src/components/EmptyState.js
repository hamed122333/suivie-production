import React from 'react';

const EmptyState = ({ icon, message }) => (
  <div className="empty-state">
    {icon && <span className="empty-icon">{icon}</span>}
    <p>{message}</p>
  </div>
);

export default EmptyState;
