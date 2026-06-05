import React from 'react';
import './StockAllocationBadge.css';

/**
 * Badge d'allocation de stock affiché sur la carte Kanban.
 * Le détail (demandé / alloué / manquant / priorité FIFO) est exposé via un
 * `title` natif — pas de tooltip positionné en absolu (évite les sauts d'écran
 * au survol pendant le scroll dans les colonnes).
 */
const StockAllocationBadge = ({ task }) => {
  if (!task) return null;

  // Pièces → entiers, sans unité (« pcs » implicite).
  const requested = Math.round(Number(task.quantity || 0));
  const allocated = Math.round(Number(task.stock_allocated ?? 0));
  const deficit = Math.round(Number(task.stock_deficit || 0));
  const hasDeficit = deficit > 0;
  const priorityOrder = task.priority_order;
  const isShared = priorityOrder != null && priorityOrder >= 1;

  // Affiché sur Hors Stock PF, et sur les autres statuts actifs si une priorité FIFO existe
  const showBadge = task.status === 'WAITING_STOCK' || (isShared && task.status !== 'DONE');
  if (!showBadge) return null;

  const badgeStyle = hasDeficit
    ? 'stock-badge__button--warning'
    : isShared
    ? 'stock-badge__button--shared'
    : 'stock-badge__button--success';

  // Détail dans une infobulle native (multi-lignes)
  const titleParts = [];
  if (isShared) titleParts.push(`Référence partagée — priorité #${priorityOrder}`);
  titleParts.push(`Demandé : ${requested}`);
  titleParts.push(`Alloué : ${allocated}`);
  if (hasDeficit) titleParts.push(`Manquant : ${deficit}`);
  else if (isShared) titleParts.push('✓ Stock réservé pour cette commande');
  const title = titleParts.join('\n');

  return (
    <span className="stock-badge">
      <span className={`stock-badge__button ${badgeStyle}`} title={title}>
        {isShared && (
          <span className="stock-badge__order">#{priorityOrder}</span>
        )}
        <span className="stock-badge__requested">{requested}</span>
        <span className="stock-badge__separator">/</span>
        <span className={`stock-badge__allocated ${hasDeficit ? 'stock-badge__allocated--warning' : 'stock-badge__allocated--ok'}`}>
          {allocated}
        </span>
        {hasDeficit && <span className="stock-badge__icon" aria-hidden>⚠️</span>}
      </span>
    </span>
  );
};

export default StockAllocationBadge;
