import React, { useState } from 'react';
import './StockAllocationBadge.css';

const StockAllocationBadge = ({ task }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!task) return null;

  const requested = Number(task.quantity || 0);
  const allocated = Number(task.stock_allocated ?? 0);
  const deficit = Number(task.stock_deficit || 0);
  const unit = task.quantity_unit || 'pcs';
  const hasDeficit = deficit > 0;
  const priorityOrder = task.priority_order;
  const isShared = priorityOrder != null && priorityOrder >= 1;

  // Show badge on WAITING_STOCK always, and on TODO/IN_PROGRESS/BLOCKED only if shared (priority_order exists)
  const showBadge = task.status === 'WAITING_STOCK' || (isShared && task.status !== 'DONE');
  if (!showBadge) return null;

  // Determine badge style
  const badgeStyle = hasDeficit
    ? 'stock-badge__button--warning'
    : isShared
    ? 'stock-badge__button--shared'
    : 'stock-badge__button--success';

  return (
    <div
      className="stock-badge"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button className={`stock-badge__button ${badgeStyle}`}>
        {isShared && (
          <span className="stock-badge__order" title={`Priorité ${priorityOrder}`}>
            #{priorityOrder}
          </span>
        )}
        <span className="stock-badge__requested">{requested}</span>
        <span className="stock-badge__separator">/</span>
        <span className={`stock-badge__allocated ${hasDeficit ? 'stock-badge__allocated--warning' : 'stock-badge__allocated--ok'}`}>
          {allocated}
        </span>
        {hasDeficit && <span className="stock-badge__icon" aria-hidden>⚠️</span>}
        <span className="stock-badge__unit">{unit}</span>
      </button>

      {showTooltip && (
        <div className="stock-badge__tooltip">
          {isShared && (
            <div className="stock-badge__tooltip-row stock-badge__tooltip-row--header">
              <span className="stock-badge__tooltip-label">Réf. partagée</span>
              <span className="stock-badge__tooltip-value stock-badge__tooltip-value--info">
                Priorité {priorityOrder}{priorityOrder === 1 ? 'ère' : 'ème'}
              </span>
            </div>
          )}
          <div className="stock-badge__tooltip-row">
            <span className="stock-badge__tooltip-label">Demandé:</span>
            <span className="stock-badge__tooltip-value">{requested} {unit}</span>
          </div>
          <div className="stock-badge__tooltip-row">
            <span className="stock-badge__tooltip-label">Alloué:</span>
            <span className={`stock-badge__tooltip-value ${allocated >= requested ? 'stock-badge__tooltip-value--success' : 'stock-badge__tooltip-value--warning'}`}>
              {allocated} {unit}
            </span>
          </div>
          {hasDeficit && (
            <div className="stock-badge__tooltip-row">
              <span className="stock-badge__tooltip-label">Manquant:</span>
              <span className="stock-badge__tooltip-value stock-badge__tooltip-value--warning">
                {deficit} {unit}
              </span>
            </div>
          )}
          {isShared && !hasDeficit && (
            <div className="stock-badge__tooltip-row stock-badge__tooltip-row--note">
              <span className="stock-badge__tooltip-note">
                ✓ Stock réservé pour cette commande
              </span>
            </div>
          )}
          {isShared && hasDeficit && (
            <div className="stock-badge__tooltip-row stock-badge__tooltip-row--note">
              <span className="stock-badge__tooltip-note">
                Autres commandes partagent cette réf. article
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StockAllocationBadge;
