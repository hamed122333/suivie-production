import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import { analyticsAPI } from '../services/api';
import { formatDate, formatQuantity } from '../utils/formatters';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import './AnalyticsPage.css';

const COLORS = { validated: '#16a34a', pending: '#f59e0b', delivered: '#2563eb' };

function AnalyticsPage() {
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

  // Top commerciaux par commandes validées (pour le graphique en barres)
  const barData = useMemo(
    () => commercials
      .filter((c) => c.totalOrders > 0)
      .slice(0, 12)
      .map((c) => ({ name: c.name || c.commercialId, validées: c.validated, 'en attente': c.pending })),
    [commercials]
  );

  const pieData = useMemo(() => summary ? [
    { name: 'Validées', value: summary.totalValidated, key: 'validated' },
    { name: 'En attente', value: summary.totalPending, key: 'pending' },
  ] : [], [summary]);

  if (loading) return <Spinner message="Chargement des analyses…" />;
  if (error) return <div className="analytics-page"><div className="analytics-error">{error}</div></div>;

  return (
    <div className="analytics-page">
      <div className="analytics-header">
        <h1>Analytics — Performance commerciale</h1>
        <p>Vue d'ensemble de l'activité des commerciaux (lecture seule).</p>
      </div>

      {/* KPIs */}
      <div className="analytics-kpis">
        <div className="analytics-kpi"><span>Commerciaux</span><strong>{summary.commercialsCount}</strong></div>
        <div className="analytics-kpi analytics-kpi--ok"><span>Actifs (&lt; {summary.activeDays} j)</span><strong>{summary.activeCount}</strong></div>
        <div className="analytics-kpi analytics-kpi--muted"><span>Inactifs</span><strong>{summary.inactiveCount}</strong></div>
        <div className="analytics-kpi"><span>Commandes</span><strong>{formatQuantity(summary.totalOrders)}</strong></div>
        <div className="analytics-kpi analytics-kpi--ok"><span>Validées</span><strong>{formatQuantity(summary.totalValidated)}</strong></div>
        <div className="analytics-kpi analytics-kpi--warn"><span>En attente</span><strong>{formatQuantity(summary.totalPending)}</strong></div>
      </div>

      {summary.bestCommercial && (
        <div className="analytics-best">
          🏆 Meilleur commercial : <strong>{summary.bestCommercial.name || summary.bestCommercial.commercialId}</strong>
          {' '}— {summary.bestCommercial.validated} commande(s) validée(s) ({summary.bestCommercial.validationRate}%)
        </div>
      )}

      <div className="analytics-grid">
        {/* Barres : commandes par commercial */}
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
                <Bar dataKey="validées" stackId="a" fill={COLORS.validated} radius={[0, 0, 0, 0]} />
                <Bar dataKey="en attente" stackId="a" fill={COLORS.pending} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        {/* Donut : validées vs en attente */}
        <section className="analytics-card">
          <h3>Validées vs en attente</h3>
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

      {/* Tableau : actifs / inactifs */}
      <section className="analytics-card">
        <h3>Détail commerciaux</h3>
        <div className="analytics-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Commercial</th>
                <th className="text-center">Statut</th>
                <th className="text-center">Commandes</th>
                <th className="text-center">Validées</th>
                <th className="text-center">% validation</th>
                <th className="text-center">Quantité</th>
                <th>Dernière commande</th>
              </tr>
            </thead>
            <tbody>
              {commercials.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.name || '—'}</strong> <span className="analytics-cid">{c.commercialId}</span></td>
                  <td className="text-center">
                    <span className={`analytics-badge ${c.active ? 'analytics-badge--active' : 'analytics-badge--inactive'}`}>
                      {c.active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="text-center">{c.totalOrders}</td>
                  <td className="text-center">{c.validated}</td>
                  <td className="text-center">{c.validationRate}%</td>
                  <td className="text-center">{formatQuantity(c.totalQuantity)}</td>
                  <td>{c.lastOrderAt ? formatDate(c.lastOrderAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default AnalyticsPage;
