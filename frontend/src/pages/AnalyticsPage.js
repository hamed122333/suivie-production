import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import { analyticsAPI } from '../services/api';
import { formatDate, formatQuantity } from '../utils/formatters';
import { TASK_STATUS_CONFIG } from '../constants/task';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import './AnalyticsPage.css';

// Tunnel commercial : En attente (à valider) → En cours (validée, en production) → Livrées.
const COLORS = { pending: '#f59e0b', inProgress: '#6366f1', delivered: '#16a34a' };

const inProgressOf = (c) => Math.max(0, (c.validated || 0) - (c.delivered || 0));

function CommercialSection() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState({ commercials: [], summary: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await analyticsAPI.commercials();
        if (!cancelled) setData(res.data);
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.error || 'Impossible de charger les analyses.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const { commercials, summary } = data;

  const barData = useMemo(
    () => commercials
      .filter((c) => c.totalOrders > 0)
      .slice(0, 12)
      .map((c) => ({
        name: c.name || c.commercialId,
        'en attente': c.pending,
        'en cours': inProgressOf(c),
        'livrées': c.delivered || 0,
      })),
    [commercials]
  );

  const totalInProgress = summary ? Math.max(0, summary.totalValidated - summary.totalDelivered) : 0;

  const pieData = useMemo(() => summary ? [
    { name: 'En attente', value: summary.totalPending, key: 'pending' },
    { name: 'En cours', value: Math.max(0, summary.totalValidated - summary.totalDelivered), key: 'inProgress' },
    { name: 'Livrées', value: summary.totalDelivered, key: 'delivered' },
  ] : [], [summary]);

  // « Meilleur commercial » = celui qui a le plus de commandes LIVRÉES (business abouti).
  const bestByDelivered = useMemo(() => {
    if (!commercials.length) return null;
    const sorted = [...commercials].filter((c) => (c.delivered || 0) > 0)
      .sort((a, b) => (b.delivered || 0) - (a.delivered || 0));
    return sorted[0] || null;
  }, [commercials]);

  if (loading) return <Spinner message="Chargement des analyses…" />;
  if (error) return <div className="analytics-error">{error}</div>;

  return (
    <>
      <div className="analytics-kpis">
        <div className="analytics-kpi"><span>Commerciaux</span><strong>{summary.commercialsCount}</strong></div>
        <div className="analytics-kpi analytics-kpi--ok"><span>Actifs (&lt; {summary.activeDays} j)</span><strong>{summary.activeCount}</strong></div>
        <div className="analytics-kpi analytics-kpi--muted"><span>Inactifs</span><strong>{summary.inactiveCount}</strong></div>
        <div className="analytics-kpi"><span>Commandes</span><strong>{formatQuantity(summary.totalOrders)}</strong></div>
        <div className="analytics-kpi analytics-kpi--warn"><span>En attente</span><strong>{formatQuantity(summary.totalPending)}</strong></div>
        <div className="analytics-kpi"><span>En cours</span><strong>{formatQuantity(totalInProgress)}</strong></div>
        <div className="analytics-kpi analytics-kpi--ok"><span>Livrées</span><strong>{formatQuantity(summary.totalDelivered)}</strong></div>
      </div>

      {bestByDelivered && (
        <div className="analytics-best">
          🏆 Meilleur commercial : <strong>{bestByDelivered.name || bestByDelivered.commercialId}</strong>
          {' '}— {bestByDelivered.delivered} commande(s) livrée(s) sur {bestByDelivered.totalOrders}
        </div>
      )}

      <div className="analytics-grid">
        <section className="analytics-card analytics-card--wide">
          <h3>Commandes par commercial</h3>
          {barData.length === 0 ? <EmptyState message="Aucune commande." /> : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} interval={0} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="en attente" stackId="a" fill={COLORS.pending} />
                <Bar dataKey="en cours" stackId="a" fill={COLORS.inProgress} />
                <Bar dataKey="livrées" stackId="a" fill={COLORS.delivered} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="analytics-card">
          <h3>Tunnel des commandes</h3>
          {summary.totalOrders === 0 ? <EmptyState message="Aucune commande." /> : (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {pieData.map((d) => <Cell key={d.key} fill={COLORS[d.key]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      <section className="analytics-card">
        <h3>Détail commerciaux</h3>
        <div className="analytics-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Commercial</th>
                <th className="text-center">Statut</th>
                <th className="text-center">Commandes</th>
                <th className="text-center">En attente</th>
                <th className="text-center">En cours</th>
                <th className="text-center">Livrées</th>
                <th className="text-center">% livré</th>
                <th>Dernière commande</th>
              </tr>
            </thead>
            <tbody>
              {commercials.map((c) => {
                const deliveredRate = c.totalOrders > 0 ? Math.round(((c.delivered || 0) / c.totalOrders) * 100) : 0;
                return (
                <tr key={c.id}>
                  <td><strong>{c.name || '—'}</strong> <span className="analytics-cid">{c.commercialId}</span></td>
                  <td className="text-center">
                    <span className={`analytics-badge ${c.active ? 'analytics-badge--active' : 'analytics-badge--inactive'}`}>
                      {c.active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="text-center">{c.totalOrders}</td>
                  <td className="text-center">{c.pending}</td>
                  <td className="text-center">{inProgressOf(c)}</td>
                  <td className="text-center">{c.delivered || 0}</td>
                  <td className="text-center">{deliveredRate}%</td>
                  <td>{c.lastOrderAt ? formatDate(c.lastOrderAt) : '—'}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function statusLabel(status) {
  return TASK_STATUS_CONFIG[status]?.shortLabel || status;
}

function FlowSection() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flow, setFlow] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await analyticsAPI.flow();
        if (!cancelled) setFlow(res.data);
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.error || 'Impossible de charger les métriques de flux.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const throughputData = useMemo(
    () => (flow?.throughput || []).map((t) => ({ name: formatDate(t.week), livrées: t.delivered })),
    [flow]
  );

  const columnData = useMemo(
    () => (flow?.timePerColumn || [])
      .filter((c) => c.samples > 0)
      .map((c) => ({ name: statusLabel(c.status), jours: c.avgDays })),
    [flow]
  );

  const cfdData = useMemo(
    () => (flow?.cfd || []).map((row) => {
      const point = { name: formatDate(row.day) };
      (flow.statuses || []).forEach((s) => { point[statusLabel(s)] = row[s] || 0; });
      return point;
    }),
    [flow]
  );

  if (loading) return <Spinner message="Calcul des métriques de flux…" />;
  if (error) return <div className="analytics-error">{error}</div>;
  if (!flow) return <EmptyState message="Aucune donnée de flux." />;

  const totalThroughput = throughputData.reduce((s, t) => s + t.livrées, 0);

  // « En-cours actuel » = commandes actives (hors stock / à préparer / en prép. / bloquées)
  // au dernier jour du CFD — une photo instantanée de la charge.
  const latestCfd = (flow.cfd && flow.cfd.length) ? flow.cfd[flow.cfd.length - 1] : null;
  const currentWip = latestCfd
    ? ['WAITING_STOCK', 'TODO', 'IN_PROGRESS', 'BLOCKED'].reduce((s, k) => s + (latestCfd[k] || 0), 0)
    : 0;

  return (
    <>
      <div className="analytics-kpis">
        <div className="analytics-kpi"><span>Délai total moyen</span><strong>{flow.leadTime.avgDays} j</strong></div>
        <div className="analytics-kpi"><span>Délai total médian</span><strong>{flow.leadTime.medianDays} j</strong></div>
        <div className="analytics-kpi analytics-kpi--ok"><span>Délai production moyen</span><strong>{flow.cycleTime.avgDays} j</strong></div>
        <div className="analytics-kpi"><span>Délai production médian</span><strong>{flow.cycleTime.medianDays} j</strong></div>
        <div className="analytics-kpi analytics-kpi--ok"><span>Livrées / {flow.window.throughputWeeks} sem.</span><strong>{totalThroughput}</strong></div>
        <div className="analytics-kpi analytics-kpi--warn"><span>En-cours actuel</span><strong>{currentWip}</strong></div>
      </div>
      <p className="analytics-hint">
        <strong>Délai total</strong> (lead time) = création → livraison · <strong>Délai production</strong> (cycle time)
        = mise en production → livraison. Calculés sur les {flow.window.leadTimeDays} derniers jours
        ({flow.leadTime.count} commande{flow.leadTime.count > 1 ? 's' : ''} livrée{flow.leadTime.count > 1 ? 's' : ''}).
      </p>

      <section className="analytics-card analytics-card--wide">
        <h3>Diagramme de flux cumulé (CFD) — {flow.window.cfdDays} jours</h3>
        {cfdData.length === 0 ? <EmptyState message="Pas assez d'historique." /> : (
          <ResponsiveContainer width="100%" height={340}>
            <AreaChart data={cfdData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              {(flow.statuses || []).map((s) => {
                const label = statusLabel(s);
                const color = TASK_STATUS_CONFIG[s]?.color || '#94a3b8';
                return <Area key={s} type="monotone" dataKey={label} stackId="1" stroke={color} fill={color} fillOpacity={0.55} />;
              })}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </section>

      <div className="analytics-grid">
        <section className="analytics-card">
          <h3>Débit hebdomadaire (commandes livrées)</h3>
          {throughputData.length === 0 ? <EmptyState message="Aucune livraison récente." /> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={throughputData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="livrées" fill={COLORS.delivered} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="analytics-card">
          <h3>Temps moyen par colonne (jours)</h3>
          {columnData.length === 0 ? <EmptyState message="Pas assez d'historique." /> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={columnData} layout="vertical" margin={{ top: 8, right: 16, left: 24, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip />
                <Bar dataKey="jours" fill="#7c3aed" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      <section className="analytics-card">
        <h3>Cartes les plus anciennes en colonne (aging WIP)</h3>
        {(!flow.aging || flow.aging.length === 0) ? <EmptyState message="Aucune carte active." /> : (
          <div className="analytics-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tâche</th>
                  <th>Article</th>
                  <th className="text-center">Colonne</th>
                  <th className="text-center">Jours en colonne</th>
                </tr>
              </thead>
              <tbody>
                {flow.aging.map((a) => (
                  <tr key={a.id}>
                    <td><strong>SP-{a.id}</strong> {a.title}</td>
                    <td>{a.itemReference || '—'}</td>
                    <td className="text-center">{statusLabel(a.status)}</td>
                    <td className="text-center">
                      <span className={`analytics-badge ${a.days >= 7 ? 'analytics-badge--inactive' : a.days >= 3 ? 'analytics-badge--warn' : 'analytics-badge--active'}`}>
                        {a.days} j
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function AnalyticsPage() {
  const [tab, setTab] = useState('flow');

  return (
    <div className="analytics-page">
      <div className="analytics-header">
        <h1>Analytics</h1>
        <p>Vue d'ensemble de l'activité et du flux de production (lecture seule).</p>
      </div>

      <div className="analytics-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'flow'}
          className={`analytics-tab${tab === 'flow' ? ' analytics-tab--active' : ''}`}
          onClick={() => setTab('flow')}
        >
          Flux de production
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'commercial'}
          className={`analytics-tab${tab === 'commercial' ? ' analytics-tab--active' : ''}`}
          onClick={() => setTab('commercial')}
        >
          Performance commerciale
        </button>
      </div>

      {tab === 'flow' ? <FlowSection /> : <CommercialSection />}
    </div>
  );
}

export default AnalyticsPage;
