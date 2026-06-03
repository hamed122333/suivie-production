-- Functional indexes matching the case-insensitive / date-truncated predicates
-- used in hot paths. Without these, predicates wrapped in UPPER()/DATE() cannot
-- use the plain-column indexes and fall back to sequential scans — costly on the
-- Supabase free tier and amplified by the per-article FIFO recalculation loops.
--
-- Pure performance: no schema/logic change, results are identical.
-- Run: psql -d suivi_production -f migrations/018_functional_indexes.sql

-- getStockQuantity: WHERE UPPER(article) = UPPER($1)  (stockImportModel.js)
CREATE INDEX IF NOT EXISTS idx_stock_import_upper_article
  ON stock_import (UPPER(article));

-- appendFilters: UPPER(t.item_reference) = $n  (taskModel.js)
CREATE INDEX IF NOT EXISTS idx_tasks_upper_item_reference
  ON tasks (UPPER(item_reference));

-- appendFilters: DATE(t.created_at) = / >= / <= $n  (taskModel.js)
CREATE INDEX IF NOT EXISTS idx_tasks_created_at_date
  ON tasks (DATE(created_at));
