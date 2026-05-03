import React from 'react';

const Spinner = ({ message }) => (
  <div className="loading-state">
    <div className="spinner" />
    {message && <p>{message}</p>}
  </div>
);

export default Spinner;
