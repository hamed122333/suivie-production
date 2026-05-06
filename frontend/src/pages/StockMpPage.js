import React, { useState, useEffect, useMemo, useRef } from 'react';
import { stockMpAPI } from '../services/api';
import StockImportMpModal from '../components/StockImportMpModal';
import ManualStockMpModal from '../components/ManualStockMpModal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/formatters';
import './StockPage.css';

const StockMpPage = () => {
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
  const inputRef = useRef(null);

  const fetchStock = async () => {
    try {
      setIsLoading(true);
      setError('');
      const response = await stockMpAPI.getAll();
      setStockItems(response.data || response);
    } catch (err) {
      console.error('Erreur', err);
      setError('Impossible de charger les stocks MP.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchStock(); }, []);

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
    if (!searchTerm) return safeArray;
    const q = searchTerm.toLowerCase();
    return safeArray.filter((item) =>
      (item.article || '').toLowerCase().includes(q) ||
      (item.designation || '').toLowerCase().includes(q) ||
      (item.client_name || '').toLowerCase().includes(q) ||
      (item.client_code || '').toLowerCase().includes(q)
    );
  }, [safeArray, searchTerm]);

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
          <h2>📦 Stock Matière Première</h2>
          <p>Consultez et gérez l'état des matières premières.</p>
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
              aria-label="Rechercher dans le stock MP"
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
            <span>{isFiltered ? `référence${filteredArticleCount > 1 ? 's' : ''} trouvée${filteredArticleCount > 1 ? 's' : ''}` : `référence${uniqueArticleCount > 1 ? 's' : ''}`}</span>
          </div>
          <div className="stock-stat">
            <strong>{isFiltered ? filteredStock.length : safeArray.length}</strong>
            <span>{isFiltered ? 'ligne(s) filtrée(s)' : 'lignes totales'}</span>
          </div>
          <div className="stock-stat">
            <strong>{(isFiltered ? filteredQty : totalQty).toLocaleString('fr-FR')}</strong>
            <span>unités{isFiltered ? ' filtrées' : ' en stock'}</span>
          </div>
          {isFiltered && (
            <button type="button" className="stock-stats-strip__clear" onClick={clearSearch}>
              ✕ Effacer le filtre «&nbsp;{searchTerm}&nbsp;»
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
            <EmptyState icon="📭" message="Aucune matière première en stock trouvée." />
          )
        ) : (
          <div className="table-card">
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th onClick={() => requestSort('article')} className="sortable-header">
                        Code Article {getSortIcon('article')}
                      </th>
                    <th onClick={() => requestSort('designation')} className="sortable-header">
                        Désignation {getSortIcon('designation')}
                      </th>
                    <th onClick={() => requestSort('client')} className="sortable-header">
                        Client {getSortIcon('client')}
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
                            <span className="article-name">
                              {isFiltered && searchTerm
                                ? highlightMatch(item.article, searchTerm)
                                : item.article}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="item-designation text-sm text-gray">
                          {item.designation
                            ? (isFiltered ? highlightMatch(item.designation, searchTerm) : item.designation)
                            : <span className="text-muted italic">Spécifiée par référence</span>}
                        </span>
                      </td>
                      <td>
                        <div className="item-client">
                          {item.client_name ? (
                            <span className="client-name">
                              {isFiltered ? highlightMatch(item.client_name, searchTerm) : item.client_name}
                            </span>
                          ) : (
                            <span className="text-muted italic">Non spécifié</span>
                          )}
                          {item.client_code && (
                            <span className="client-code text-xs text-gray ml-2">({item.client_code})</span>
                          )}
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
                              ? formatDate(item.ready_date || item.date_import)
                              : 'N/A'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
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
        <StockImportMpModal onClose={() => setIsModalOpen(false)} onImported={handleImported} />
      )}
      {isManualModalOpen && (
        <ManualStockMpModal onClose={() => setIsManualModalOpen(false)} onAdded={handleManualAdded} />
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

export default StockMpPage;
