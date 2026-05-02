import React, { useState } from 'react';
import './StockAllocationBadge.css';

const StockAllocationBadge = ({ task }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!task || task.status !== 'WAITING_STOCK') return null;

  const requested = Number(task.quantity || 0);
  const allocated = Number(task.stock_allocated ?? requested);
  const deficit = Number(task.stock_deficit || 0);
  const unit = task.quantity_unit || 'pcs';
  const hasDeficit = deficit > 0;

  return (
    <div
      className="stock-badge"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button className={`stock-badge__button ${hasDeficit ? 'stock-badge__button--warning' : 'stock-badge__button--success'}`}>
        <span className="stock-badge__requested">{requested}</span>
        <span className="stock-badge__separator">/</span>
        {hasDeficit && <span className="stock-badge__icon" aria-hidden>⚠️</span>}
        <span className={`stock-badge__deficit ${hasDeficit ? 'stock-badge__deficit--warning' : ''}`}>
          {deficit}
        </span>
        <span className="stock-badge__unit">{unit}</span>
      </button>

      {showTooltip && (
        <div className="stock-badge__tooltip">
          <div className="stock-badge__tooltip-row">
            <span className="stock-badge__tooltip-label">Demandé:</span>
            <span className="stock-badge__tooltip-value">{requested.toFixed(2)} {unit}</span>
          </div>
          <div className="stock-badge__tooltip-row">
            <span className="stock-badge__tooltip-label">Alloué:</span>
            <span className="stock-badge__tooltip-value stock-badge__tooltip-value--success">{allocated.toFixed(2)} {unit}</span>
          </div>
          {hasDeficit && (
            <div className="stock-badge__tooltip-row">
              <span className="stock-badge__tooltip-label">Manquant:</span>
              <span className="stock-badge__tooltip-value stock-badge__tooltip-value--warning">{deficit.toFixed(2)} {unit}</span>
            </div>
          )}
          {task.priority_order && (
            <div className="stock-badge__tooltip-row">
              <span className="stock-badge__tooltip-label">Priorité:</span>
              <span className="stock-badge__tooltip-value stock-badge__tooltip-value--info">
                {task.priority_order}{task.priority_order === 1 ? 'ère' : 'ème'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StockAllocationBadge;
