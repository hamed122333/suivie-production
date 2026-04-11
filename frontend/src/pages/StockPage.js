import React, { useState, useEffect, useMemo } from 'react';
import { stockImportAPI } from '../services/api';
import StockImportModal from '../components/StockImportModal';
import ManualStockModal from '../components/ManualStockModal';
import { useAuth } from '../context/AuthContext';
import './StockPage.css';

const getRelativeTimeString = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const today = new Date();

  // reset times to midnight to avoid partial days
  date.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Demain";
  if (diffDays === -1) return "Hier";

  if (diffDays > 0) return `Dans ${diffDays} jours`;
  return `Il y a ${Math.abs(diffDays)} jours`;
};

const StockPage = () => {
  const { user } = useAuth();
  const [stockItems, setStockItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const itemsPerPage = 15;

  const fetchStock = async () => {
    try {
      setIsLoading(true);
      setError('');
      const response = await stockImportAPI.getAll();
      setStockItems(response.data || response);
    } catch (err) {
      console.error('Erreur', err);
      setError('Impossible de charger les stocks.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStock();
  }, []);

  const handleImported = () => {
    fetchStock();
  };

  const handleManualAdded = () => {
    fetchStock();
  };

  const isPlanner = user?.role === 'planner' || user?.role === 'super_admin';

  // --- Processing Data (Filter -> Sort -> Paginate) ---
  const safeArray = useMemo(() =>
    Array.isArray(stockItems) ? stockItems : [],
    [stockItems]
  );

  const uniqueArticles = useMemo(() => {
    const articles = safeArray.map(item => item.article).filter(Boolean);
    return [...new Set(articles)].sort((a, b) => a.localeCompare(b));
  }, [safeArray]);

  const filteredStock = useMemo(() => {
    setCurrentPage(1);
    if (!searchTerm) return safeArray;
    return safeArray.filter((item) =>
      (item.article || '') === searchTerm
    );
  }, [safeArray, searchTerm]);

  const sortedStock = useMemo(() => {
    let sortableItems = [...filteredStock];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let aValue, bValue;

        switch (sortConfig.key) {
          case 'article':
            aValue = (a.article || '').toLowerCase();
            bValue = (b.article || '').toLowerCase();
            break;
          case 'quantity':
            aValue = Number(a.quantity || 0);
            bValue = Number(b.quantity || 0);
            break;
          case 'date':
          default:
            aValue = new Date(a.ready_date || a.date_import || 0).getTime();
            bValue = new Date(b.ready_date || b.date_import || 0).getTime();
            break;
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredStock, sortConfig]);

  const totalPages = Math.ceil(sortedStock.length / itemsPerPage) || 1;
  const currentItems = sortedStock.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (columnName) => {
    if (sortConfig.key !== columnName) return <span className="sort-icon-hidden">↕</span>;
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="stock-page-container">
      <div className="stock-page-header">
        <div className="title-section">
          <h2>📦 Stock & Produits Finis</h2>
          <p>Consultez et gérez l'état des produits finis.</p>
        </div>
        <div className="actions-section">
          <div className="search-wrapper">
            <span className="search-icon">📦</span>
            <select
              className="search-input select-dropdown"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            >
              <option value="">Tous les produits...</option>
              {uniqueArticles.map((article, index) => (
                <option key={index} value={article}>
                  {article}
                </option>
              ))}
            </select>
          </div>
          {isPlanner && (
            <div className="buttons-group">
              <button className="btn btn-outline" onClick={() => setIsManualModalOpen(true)}>
                + Ajout Manuel
              </button>
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(true)}>
                ↑ Importer Excel
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <div className="error-alert">{error}</div>}

      <div className="stock-content">
        {isLoading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Chargement des données...</p>
          </div>
        ) : sortedStock.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📭</span>
            <p>Aucun produit en stock trouvé.</p>
          </div>
        ) : (
          <div className="table-card">
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th onClick={() => requestSort('article')} className="sortable-header">
                      Produits / Articles {getSortIcon('article')}
                    </th>
                    <th onClick={() => requestSort('quantity')} className="sortable-header text-center">
                      Quantité {getSortIcon('quantity')}
                    </th>
                    <th onClick={() => requestSort('date')} className="sortable-header text-right">
                      Disponibilité {getSortIcon('date')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {currentItems.map((item, index) => (
                    <tr key={item.id || index}>
                      <td>
                        <div className="item-article">
                          <div className="article-icon">📦</div>
                          <div className="article-info">
                            <span className="article-name">{item.article}</span>
                            <span className="article-subtext">Réf: {(item.article || '').substring(0, 3).toUpperCase()}</span>
                          </div>
                        </div>
                      </td>
                      <td className="item-quantity text-center">
                        <span className="qty-badge">{item.quantity}</span>
                      </td>
                      <td className="item-date text-right">
                        <div className="date-wrapper">
                          <span className="date-icon">📅</span>
                          <span className="date-text">
                            {item.ready_date || item.date_import
                              ? getRelativeTimeString(item.ready_date || item.date_import)
                              : 'N/A'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && !isLoading && (
              <div className="pagination-container">
                <button
                  className="btn-page"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  &laquo; Précédent
                </button>
                <span className="page-indicator">
                  Page {currentPage} sur {totalPages}
                </span>
                <button
                  className="btn-page"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Suivant &raquo;
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {isModalOpen && (
        <StockImportModal
          onClose={() => setIsModalOpen(false)}
          onImported={handleImported}
        />
      )}

      {isManualModalOpen && (
        <ManualStockModal
          onClose={() => setIsManualModalOpen(false)}
          onAdded={handleManualAdded}
        />
      )}
    </div>
  );
};

export default StockPage;

