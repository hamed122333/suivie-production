import React, { useState, useEffect, useMemo, useRef } from 'react';
import { stockImportAPI } from '../services/api';
import StockImportModal from '../components/StockImportModal';
import ManualStockModal from '../components/ManualStockModal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/formatters';
import useServerEvents from '../hooks/useServerEvents';
import './StockPage.css';

const StockPage = () => {
  const { user } = useAuth();
  const [stockItems, setStockItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  const [inputValue, setInputValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const inputRef = useRef(null);

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

  useEffect(() => { fetchStock(); }, []);

  // Real-time: auto-refresh when stock changes from another tab/user
  useServerEvents({
    'stock-updated': () => fetchStock(),
    'tasks-updated': () => fetchStock(), // allocation changes affect available_quantity
  });

  const handleImported = () => { fetchStock(); };
  const handleManualAdded = () => { fetchStock(); };

  const isPlanner = user?.role === 'planner' || user?.role === 'super_admin';

  const safeArray = useMemo(() => Array.isArray(stockItems) ? stockItems : [], [stockItems]);

  const applySearch = () => {
    setSearchTerm(inputValue.trim());
    setCurrentPage(1);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') applySearch();
    if (e.key === 'Escape') { setInputValue(''); setSearchTerm(''); setCurrentPage(1); }
  };

  const clearSearch = () => {
    setInputValue('');
    setSearchTerm('');
    setCurrentPage(1);
    inputRef.current?.focus();
  };

  const filteredStock = useMemo(() => {
    let items = safeArray;
    
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      items = items.filter((item) =>
        (item.article || '').toLowerCase().includes(q) ||
        (item.designation || '').toLowerCase().includes(q) ||
        (item.client_name || '').toLowerCase().includes(q) ||
        (item.client_code || '').toLowerCase().includes(q)
      );
    }
    
    if (categoryFilter) {
      items = items.filter((item) => item.article_prefix === categoryFilter);
    }
    
    if (statusFilter) {
      if (statusFilter === 'READY') {
        items = items.filter((item) => item.is_ready === true);
      } else if (statusFilter === 'PENDING') {
        items = items.filter((item) => item.is_ready === false);
      } else if (statusFilter === 'LOW_STOCK') {
        items = items.filter((item) => item.coverage_percent < 100);
      }
    }
    
    return items;
  }, [safeArray, searchTerm, categoryFilter, statusFilter]);

  const sortedStock = useMemo(() => {
    const sortableItems = [...filteredStock];
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
          case 'client':
            aValue = (a.client_name || a.client_code || '').toLowerCase();
            bValue = (b.client_name || b.client_code || '').toLowerCase();
            break;
          case 'designation':
            aValue = (a.designation || '').toLowerCase();
            bValue = (b.designation || '').toLowerCase();
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

  const totalQty = useMemo(() => safeArray.reduce((sum, i) => sum + Number(i.quantity || 0), 0), [safeArray]);
  const filteredQty = useMemo(() => filteredStock.reduce((sum, i) => sum + Number(i.quantity || 0), 0), [filteredStock]);
  const uniqueArticleCount = useMemo(() => new Set(safeArray.map(i => i.article).filter(Boolean)).size, [safeArray]);
  const filteredArticleCount = useMemo(() => new Set(filteredStock.map(i => i.article).filter(Boolean)).size, [filteredStock]);
  const totalAvailable = useMemo(() => safeArray.reduce((sum, i) => sum + Number(i.available_quantity || 0), 0), [safeArray]);
  const totalReserved = useMemo(() => safeArray.reduce((sum, i) => sum + Number(i.total_reserved || 0), 0), [safeArray]);
  const lowStockCount = useMemo(() => safeArray.filter(i => i.coverage_percent < 100).length, [safeArray]);
  const readyCount = useMemo(() => safeArray.filter(i => i.is_ready === true).length, [safeArray]);
  const pendingCount = useMemo(() => safeArray.filter(i => i.is_ready === false).length, [safeArray]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const getSortIcon = (columnName) => {
    if (sortConfig.key !== columnName) return <span className="sort-icon-hidden">↕</span>;
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const isFiltered = Boolean(searchTerm);

  return (
    <div className="stock-page-container">
      <div className="stock-page-header">
        <div className="title-section">
          <h2>📦 Stock & Produits Finis</h2>
          <p>Consultez et gérez l'état des produits finis.</p>
        </div>
        <div className="actions-section">
          <div className="stock-search-bar">
            <span className="stock-search-bar__icon" aria-hidden>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" />
              </svg>
            </span>
            <input
              ref={inputRef}
              type="text"
              className="stock-search-bar__input"
              placeholder="Article, désignation, client… (Entrée pour chercher)"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Rechercher dans le stock"
            />
            {inputValue && (
              <button type="button" className="stock-search-bar__clear" onClick={clearSearch} aria-label="Effacer">×</button>
            )}
            <button
              type="button"
              className="stock-search-bar__btn"
              onClick={applySearch}
              title="Rechercher (Entrée)"
            >
              Rechercher
            </button>
          </div>
          <div className="stock-filters">
            <select
              className="filter-select"
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="">Toutes catégories</option>
              <option value="CI">Carterie (CI)</option>
              <option value="CV">Carterie (CV)</option>
              <option value="DI">Divers (DI)</option>
              <option value="DV">Divers (DV)</option>
              <option value="FC">Feraille (FC)</option>
              <option value="FD">Feraille (FD)</option>
              <option value="PL">Plastique (PL)</option>
            </select>
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="">Tous statuts</option>
              <option value="READY">Disponible</option>
              <option value="PENDING">En attente</option>
              <option value="LOW_STOCK">Stock insuffisant</option>
            </select>
          </div>

          {isPlanner && (
            <div className="buttons-group">
              <button className="btn btn-outline" onClick={() => setIsManualModalOpen(true)}>+ Ajout Manuel</button>
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(true)}>↑ Importer Excel</button>
            </div>
          )}
        </div>
      </div>

      {/* Stats strip */}
      {!isLoading && safeArray.length > 0 && (
        <div className="stock-stats-strip">
          <div className="stock-stat">
            <strong>{isFiltered ? filteredArticleCount : uniqueArticleCount}</strong>
            <span>{isFiltered ? `réf.` : 'réf.'}</span>
          </div>
          <div className="stock-stat stock-stat--success">
            <strong>{readyCount}</strong>
            <span>disponible{readyCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="stock-stat stock-stat--warning">
            <strong>{pendingCount}</strong>
            <span>en attente</span>
          </div>
          <div className="stock-stat stock-stat--danger">
            <strong>{lowStockCount}</strong>
            <span>stock faible</span>
          </div>
          <div className="stock-stat stock-stat--divider"></div>
          <div className="stock-stat">
            <strong>{(isFiltered ? filteredQty : totalQty).toLocaleString('fr-FR')}</strong>
            <span>unités</span>
          </div>
          <div className="stock-stat">
            <strong>{totalAvailable.toLocaleString('fr-FR')}</strong>
            <span>dispo.</span>
          </div>
          <div className="stock-stat">
            <strong>{totalReserved.toLocaleString('fr-FR')}</strong>
            <span>réservé</span>
          </div>
          {(isFiltered || categoryFilter || statusFilter) && (
            <button 
              type="button" 
              className="stock-stats-strip__clear" 
              onClick={() => { clearSearch(); setCategoryFilter(''); setStatusFilter(''); }}
            >
              ✕ Effacer les filtres
            </button>
          )}
        </div>
      )}

      {error && <div className="error-alert">{error}</div>}

      <div className="stock-content">
        {isLoading ? (
          <Spinner message="Chargement des données..." />
        ) : sortedStock.length === 0 ? (
          isFiltered ? (
            <EmptyState icon="🔍" message={`Aucun résultat pour « ${searchTerm} ». Vérifiez l'orthographe ou effacez le filtre.`} />
          ) : (
            <EmptyState icon="📭" message="Aucun produit en stock trouvé." />
          )
        ) : (
          <div className="table-card">
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th onClick={() => requestSort('article')} className="sortable-header">
                      Article {getSortIcon('article')}
                    </th>
                    <th>Catégorie</th>
                    <th onClick={() => requestSort('designation')} className="sortable-header">
                      Désignation {getSortIcon('designation')}
                    </th>
                    <th onClick={() => requestSort('client')} className="sortable-header">
                      Client {getSortIcon('client')}
                    </th>
                    <th onClick={() => requestSort('quantity')} className="sortable-header text-center">
                      Stock {getSortIcon('quantity')}
                    </th>
                    <th className="text-center">Réservé</th>
                    <th className="text-center">Dispo.</th>
                    <th className="text-center">Couverture</th>
                    <th className="text-center">Tâches</th>
                    <th onClick={() => requestSort('date')} className="sortable-header text-right">
                      Prêt {getSortIcon('date')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {currentItems.map((item, index) => {
                    const stockStatus = item.stock_status;
                    const statusClass = stockStatus === 'EMPTY' ? 'status-empty' : stockStatus === 'PARTIAL' ? 'status-partial' : 'status-full';
                    const coverageColor = item.coverage_percent >= 100 ? '#22c55e' : item.coverage_percent >= 50 ? '#f59e0b' : '#ef4444';
                    
                    return (
                    <tr key={item.id || index}>
                      <td>
                        <div className="item-article">
                          <div className={`article-badge article-badge--${item.article_prefix?.toLowerCase() || 'default'}`}>
                            {item.article_prefix || '??'}
                          </div>
                          <div className="article-info">
                            <span className="article-name">
                              {isFiltered && searchTerm
                                ? highlightMatch(item.article, searchTerm)
                                : item.article}
                            </span>
                            {item.is_ready && (
                              <span className="status-pill status-pill--ready">✓ Prêt</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="category-badge">{item.article_category || 'Autre'}</span>
                      </td>
                      <td>
                        <span className="item-designation text-sm text-gray">
                          {item.designation
                            ? (isFiltered ? highlightMatch(item.designation, searchTerm) : item.designation)
                            : <span className="text-muted italic">—</span>}
                        </span>
                      </td>
                      <td>
                        <div className="item-client">
                          {item.client_name ? (
                            <span className="client-name">
                              {isFiltered ? highlightMatch(item.client_name, searchTerm) : item.client_name}
                            </span>
                          ) : (
                            <span className="text-muted italic">—</span>
                          )}
                        </div>
                      </td>
                      <td className="item-quantity text-center">
                        <span className={`qty-badge ${statusClass}`}>{item.quantity}</span>
                      </td>
                      <td className="text-center">
                        <span className="qty-reserved">{item.total_reserved || 0}</span>
                      </td>
                      <td className="text-center">
                        <span className={`qty-available ${item.available_quantity > 0 ? '' : 'empty'}`}>
                          {item.available_quantity}
                        </span>
                      </td>
                      <td className="text-center">
                        <div className="coverage-wrapper">
                          <div className="coverage-bar">
                            <div 
                              className="coverage-fill" 
                              style={{ 
                                width: `${Math.min(100, item.coverage_percent)}%`,
                                backgroundColor: coverageColor
                              }}
                            />
                          </div>
                          <span className="coverage-text" style={{ color: coverageColor }}>
                            {item.coverage_percent}%
                          </span>
                        </div>
                      </td>
                      <td className="text-center">
                        <span className={`task-count ${item.task_count > 0 ? 'has-tasks' : ''}`}>
                          {item.task_count || 0}
                          {item.waiting_count > 0 && <span className="waiting-badge">{item.waiting_count}</span>}
                        </span>
                      </td>
                      <td className="item-date text-right">
                        <div className="date-wrapper">
                          {item.is_ready ? (
                            <span className="date-text date-ready">✓ Disponible</span>
                          ) : (
                            <>
                              <span className="date-icon">📅</span>
                              <span className="date-text">
                                {item.ready_date || item.date_import
                                  ? formatDate(item.ready_date || item.date_import)
                                  : '—'}
                              </span>
                              {item.days_until_ready !== null && item.days_until_ready > 0 && (
                                <span className="days-badge">+{item.days_until_ready}j</span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>

            {sortedStock.length > 0 && (
              <div className="pagination-container" style={{ justifyContent: 'space-between' }}>
                <div className="pagination-controls">
                  <select
                    className="page-size-select"
                    value={itemsPerPage}
                    onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  >
                    <option value={15}>15 par page</option>
                    <option value={50}>50 par page</option>
                    <option value={100}>100 par page</option>
                    <option value={10000}>Tous les articles</option>
                  </select>
                  <span className="page-indicator" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    {((currentPage - 1) * itemsPerPage) + 1}–{Math.min(currentPage * itemsPerPage, sortedStock.length)} sur {sortedStock.length}
                  </span>
                </div>

                {totalPages > 1 && (
                  <div className="pagination-buttons">
                    <button className="btn-page" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>«</button>
                    <button className="btn-page" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>‹ Précédent</button>
                    <span className="page-indicator">Page {currentPage} / {totalPages}</span>
                    <button className="btn-page" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>Suivant ›</button>
                    <button className="btn-page" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>»</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {isModalOpen && (
        <StockImportModal onClose={() => setIsModalOpen(false)} onImported={handleImported} />
      )}
      {isManualModalOpen && (
        <ManualStockModal onClose={() => setIsManualModalOpen(false)} onAdded={handleManualAdded} />
      )}
    </div>
  );
};

function highlightMatch(text, query) {
  if (!text || !query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: '#fef08a', borderRadius: '2px', padding: '0 1px' }}>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default StockPage;
