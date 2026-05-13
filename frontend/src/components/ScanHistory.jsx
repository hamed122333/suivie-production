/**
 * Scan History Component
 * Displays history of scanned codes
 */

import React, { useEffect, useState } from 'react';
import './ScanHistory.css';

export default function ScanHistory({ scans = [], onSelectScan, onExport, loading }) {
  const [filters, setFilters] = useState({
    status: 'all',
    supplier: '',
  });

  const filteredScans = scans.filter(scan => {
    if (filters.status !== 'all' && scan.status !== filters.status) return false;
    if (filters.supplier && scan.supplier !== filters.supplier) return false;
    return true;
  });

  const suppliers = [...new Set(scans.map(s => s.supplier).filter(Boolean))];

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed':
        return '#27ae60';
      case 'corrected':
        return '#f39c12';
      case 'pending':
        return '#3498db';
      default:
        return '#95a5a6';
    }
  };

  return (
    <div className="scan-history">
      <div className="history-header">
        <h2>📋 Scan History</h2>
        <button
          className="export-btn"
          onClick={() => onExport(filters)}
          disabled={loading || filteredScans.length === 0}
        >
          📥 Export to Excel
        </button>
      </div>

      {/* Filters */}
      <div className="history-filters">
        <div className="filter-group">
          <label>Status</label>
          <select
            value={filters.status}
            onChange={(e) =>
              setFilters({ ...filters, status: e.target.value })
            }
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="corrected">Corrected</option>
          </select>
        </div>

        {suppliers.length > 0 && (
          <div className="filter-group">
            <label>Supplier</label>
            <select
              value={filters.supplier}
              onChange={(e) =>
                setFilters({ ...filters, supplier: e.target.value })
              }
            >
              <option value="">All</option>
              {suppliers.map(supplier => (
                <option key={supplier} value={supplier}>
                  {supplier}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Scans list */}
      {filteredScans.length === 0 ? (
        <div className="empty-state">
          <p>📭 No scans yet</p>
        </div>
      ) : (
        <div className="scans-table">
          <div className="table-header">
            <div className="cell date">Date</div>
            <div className="cell code">Code</div>
            <div className="cell supplier">Supplier</div>
            <div className="cell score">Score</div>
            <div className="cell status">Status</div>
            <div className="cell action">Action</div>
          </div>

          <div className="table-body">
            {filteredScans.map((scan) => (
              <div key={scan.id} className="table-row">
                <div className="cell date">
                  {new Date(scan.created_at).toLocaleDateString('fr-FR')}
                </div>
                <div className="cell code">
                  <code>{scan.detected_code}</code>
                </div>
                <div className="cell supplier">{scan.supplier || '-'}</div>
                <div className="cell score">
                  <span
                    className={`score-badge ${
                      scan.detected_score >= 80
                        ? 'excellent'
                        : scan.detected_score >= 60
                        ? 'good'
                        : scan.detected_score >= 40
                        ? 'fair'
                        : 'poor'
                    }`}
                  >
                    {Math.round(scan.detected_score)}%
                  </span>
                </div>
                <div className="cell status">
                  <span
                    className="status-badge"
                    style={{
                      backgroundColor: getStatusColor(scan.status),
                    }}
                  >
                    {scan.status}
                  </span>
                </div>
                <div className="cell action">
                  <button
                    className="view-btn"
                    onClick={() => onSelectScan(scan)}
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="history-footer">
        <p>{filteredScans.length} of {scans.length} scans</p>
      </div>
    </div>
  );
}
