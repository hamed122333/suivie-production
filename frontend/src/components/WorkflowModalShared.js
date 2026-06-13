import React from 'react';
import PropTypes from 'prop-types';
import { TASK_STATUS_CONFIG, getCoveragePercent, getDeliveryProgress } from '../constants/task';
import { formatDate, formatQuantity } from '../utils/formatters';
import './StatusTransitionModal.css';

const NEGOT_ALERT = {
  PENDING_PLANNER_REVIEW: {
    title: 'Date proposée par le commercial',
    body: (task) => (
      <>
        Validez cette date ou proposez-en une autre.
        {task.proposed_delivery_date && (
          <> Proposition : <strong>{formatDate(task.proposed_delivery_date)}</strong>.</>
        )}
      </>
    ),
  },
  PENDING_COMMERCIAL_REVIEW: {
    title: 'Négociation en cours',
    body: () => 'Une proposition est déjà envoyée au commercial.',
  },
};

export function WorkflowStepper({ fromStatus, toStatus, compact = false }) {
  const from = TASK_STATUS_CONFIG[fromStatus];
  const to = TASK_STATUS_CONFIG[toStatus];
  if (!from || !to) return null;

  const fromLabel = compact && from.shortLabel ? from.shortLabel : from.label;
  const toLabel = compact && to.shortLabel ? to.shortLabel : to.label;

  return (
    <p className="wf-modal__transition" aria-label={`Transition ${from.label} vers ${to.label}`}>
      <span>{fromLabel}</span>
      <span className="wf-modal__transition-arrow" aria-hidden="true">→</span>
      <span>{toLabel}</span>
    </p>
  );
}

WorkflowStepper.propTypes = {
  fromStatus: PropTypes.string.isRequired,
  toStatus: PropTypes.string.isRequired,
  compact: PropTypes.bool,
};

export function WorkflowTaskSummary({ task }) {
  if (!task) return null;

  const coverage = getCoveragePercent(task);
  const deficit = task.stock_deficit != null ? Number(task.stock_deficit) : null;
  const details = [];

  if (task.client_name) details.push(task.client_name);
  if (task.item_reference) details.push(task.item_reference);
  if (task.order_code) details.push(task.order_code);
  const deliveryProgress = getDeliveryProgress(task);
  if (task.quantity) {
    if (deliveryProgress?.inProgress) {
      details.push(`${formatQuantity(deliveryProgress.delivered)}/${formatQuantity(deliveryProgress.total)} livrés (${deliveryProgress.pct}%)`);
    } else {
      details.push(`${formatQuantity(task.quantity)} pcs`);
    }
  }
  if (coverage !== null) details.push(`Stock ${coverage}%`);
  if (deficit !== null && deficit > 0) details.push(`${deficit} manquants`);

  return (
    <div className="wf-modal__task">
      <p className="wf-modal__task-title">{task.title}</p>
      {details.length > 0 && (
        <p className="wf-modal__task-meta">{details.join(' · ')}</p>
      )}
    </div>
  );
}

WorkflowTaskSummary.propTypes = {
  task: PropTypes.object,
};

export function WorkflowNegotiationAlert({ task }) {
  const cfg = NEGOT_ALERT[task?.date_negotiation_status];
  if (!cfg) return null;

  return (
    <div className="wf-modal__notice" role="status">
      <strong>{cfg.title}</strong>
      <p>{cfg.body(task)}</p>
    </div>
  );
}

WorkflowNegotiationAlert.propTypes = {
  task: PropTypes.object,
};

export function WorkflowDateField({ date, label = 'Date de livraison' }) {
  return (
    <div className="wf-modal__date-field">
      <span className="wf-modal__label">{label}</span>
      <span className="wf-modal__date-value">{date ? formatDate(date) : '—'}</span>
    </div>
  );
}

WorkflowDateField.propTypes = {
  date: PropTypes.string,
  label: PropTypes.string,
};
