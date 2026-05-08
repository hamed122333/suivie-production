const ExcelJS = require('exceljs');
const StockImportModel = require('../models/stockImportModel');
const TaskModel = require('../models/taskModel');
const { isValidArticleCode, normalizeArticleCode } = require('../utils/articleCode');
const { broadcast } = require('../services/sseService');
const { recalculateStockAllocation } = require('../services/stockAllocationService');

// Old autoPromote functions removed — all stock logic is now in stockAllocationService.js

/**
 * Extract a numeric value from an ExcelJS cell that may contain a raw
 * number or a formula-result object (e.g. `{ formula: '=A1', result: 10 }`).
 */
function extractCellNumber(cell) {
  const raw = cell.value;
  if (raw === null || raw === undefined) return NaN;
  if (typeof raw === 'object' && raw !== null) {
    return parseFloat(raw.result ?? raw);
  }
  return parseFloat(raw);
}

/**
 * Calculate the ready date based on article type rules:
 *   ci / cv   → +6 days
 *   di / dv   → +9 days
 *   pl        → +4 days
 *   other     → same day (0 days)
 *   Base date is taken from the file if provided, otherwise today.
 */
function calculateReadyDate(articleName, baseDateInput) {
  let date = new Date();

  if (baseDateInput) {
    if (baseDateInput instanceof Date) {
      // ExcelJS parsed it as a JS Date
      date = new Date(baseDateInput);
    } else if (typeof baseDateInput === 'string') {
      // Attempt to parse 'dd/mm/yyyy' or 'dd/mm/yy'
      const parts = baseDateInput.split(/[-\/]/);
      if (parts.length >= 3) {
        let day = parseInt(parts[0], 10);
        let month = parseInt(parts[1], 10);
        let year = parseInt(parts[2], 10);
        // Handle 2-digit years
        if (year < 100) year += 2000;
        date = new Date(year, month - 1, day);
      } else {
        const fallback = new Date(baseDateInput);
        if (!isNaN(fallback.getTime())) date = fallback;
      }
    }
  }

  // Ensure invalid dates revert to today
  if (isNaN(date.getTime())) {
     date = new Date();
  }


  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

const stockImportController = {
  async upload(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier fourni' });
      }

      const workbook = new ExcelJS.Workbook();
      try {
        await workbook.xlsx.load(req.file.buffer);
      } catch (xlsxErr) {
        // Try CSV if XLSX fails
        try {
          const stream = require('stream');
          const bufferStream = new stream.PassThrough();
          bufferStream.end(req.file.buffer);
          await workbook.csv.read(bufferStream);
        } catch (csvErr) {
          throw new Error('Le fichier doit être au format Excel (.xlsx) ou CSV valide');
        }
      }

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return res.status(400).json({ error: 'Le fichier Excel est vide ou invalide' });
      }

      // Read header row to identify column indices (search in the first 10 rows)
      let headerRow = null;
      let headers = {};
      let headerRowNumber = 1;

      for (let r = 1; r <= 10; r++) {
        const row = worksheet.getRow(r);
        const tempHeaders = {};
        let foundArticle = false;

        row.eachCell((cell, colNumber) => {
          const rawValue = typeof cell.value === 'object' && cell.value !== null ? (cell.value.richText?.map(rt => rt.text).join('') || cell.value.result || '') : cell.value;
          const value = `${rawValue || ''}`.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          tempHeaders[value] = colNumber;

          if (['article', 'code article', 'reference', 'ref'].includes(value)) {
            foundArticle = true;
          }
        });

        if (foundArticle) {
          headerRow = row;
          headers = tempHeaders;
          headerRowNumber = r;
          break;
        }
      }

      if (!headerRow) {
        return res.status(400).json({
          error: 'Impossible de trouver la ligne d\'en-tête contenant "CODE ARTICLE" ou "ARTICLE".'
        });
      }

      // Resolve article and quantity column indices
      const articleCandidates = ['article', 'articles', 'ref', 'reference', 'code article'];
      const designationCandidates = ['designation', 'designation article'];
      const clientCodeCandidates = ['client', 'code client'];
      const clientNameCandidates = ['nomclient', 'nom client', 'nom_client'];
      const quantityCandidates = ['quantite', 'qt', 'qte', 'qty', 'quantity', 'quantites', 'somme de quantite'];
      const dateCandidates = ['date', 'dates', 'date_import', 'jour', 'date entree en stock'];

      let articleColIdx = null;
      let quantityColIdx = null;
      let dateColIdx = null;
      let designationColIdx = null;
      let clientCodeColIdx = null;
      let clientNameColIdx = null;

      for (const candidate of articleCandidates) {
        if (headers[candidate] !== undefined) {
          articleColIdx = headers[candidate];
          break;
        }
      }
      for (const candidate of quantityCandidates) {
        if (headers[candidate] !== undefined) {
          quantityColIdx = headers[candidate];
          break;
        }
      }
      for (const candidate of dateCandidates) {
        if (headers[candidate] !== undefined) {
          dateColIdx = headers[candidate];
          break;
        }
      }

      for (const candidate of designationCandidates) {
        if (headers[candidate] !== undefined) {
          designationColIdx = headers[candidate];
          break;
        }
      }
      for (const candidate of clientCodeCandidates) {
        if (headers[candidate] !== undefined) {
          clientCodeColIdx = headers[candidate];
          break;
        }
      }
      for (const candidate of clientNameCandidates) {
        if (headers[candidate] !== undefined) {
          clientNameColIdx = headers[candidate];
          break;
        }
      }

      if (articleColIdx === null || quantityColIdx === null) {
        return res.status(400).json({
          error:
            'Colonnes introuvables. Le fichier doit contenir au moins les colonnes "CODE ARTICLE" et "Somme de QUANTITE".',
        });
      }

      // Phase 1: collapse exact duplicate rows (same article + client + date)
      // keeping the row with the highest quantity (pivot-table exports often repeat rows).
      const exactDedupMap = new Map();
      let skipped = 0;

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowNumber) return;

        const articleCell = row.getCell(articleColIdx);
        const quantityCell = row.getCell(quantityColIdx);

        let rawDate = null;
        if (dateColIdx !== null) rawDate = row.getCell(dateColIdx).value;

        function readText(rawVal) {
          if (rawVal === null || rawVal === undefined) return '';
          if (typeof rawVal === 'object') return (rawVal.richText?.map(rt => rt.text).join('') || rawVal.result || '');
          return `${rawVal}`;
        }

        let designation = designationColIdx !== null ? readText(row.getCell(designationColIdx).value).trim() || null : null;
        let clientCode  = clientCodeColIdx  !== null ? readText(row.getCell(clientCodeColIdx).value).trim()  || null : null;
        let clientName  = clientNameColIdx  !== null ? readText(row.getCell(clientNameColIdx).value).trim()  || null : null;

        const article  = normalizeArticleCode(readText(articleCell.value));
        const quantity = extractCellNumber(quantityCell);

        if (!article || !isValidArticleCode(article) || !Number.isFinite(quantity) || quantity <= 0) {
          skipped += 1;
          return;
        }

        const readyDate = calculateReadyDate(article, rawDate);
        const exactKey  = `${article}||${clientCode || ''}||${readyDate}`;
        const existing  = exactDedupMap.get(exactKey);

        if (existing) {
          // Same row repeated: keep whichever has the higher quantity
          if (quantity > existing.quantity) existing.quantity = quantity;
        } else {
          exactDedupMap.set(exactKey, { article, quantity, readyDate, designation, clientCode, clientName });
        }
      });

      // Phase 2: aggregate by article — sum quantities across different clients/dates.
      // Stock belongs to the article reference, not to a specific client.
      const recordsMap = new Map();
      for (const entry of exactDedupMap.values()) {
        const existing = recordsMap.get(entry.article);
        if (existing) {
          existing.quantity    = Number((existing.quantity + entry.quantity).toFixed(2));
          // Advance ready_date to the most recent entry
          if (entry.readyDate > existing.readyDate) existing.readyDate = entry.readyDate;
          // Fill in missing fields from later entries
          if (!existing.designation && entry.designation) existing.designation = entry.designation;
          if (!existing.clientCode  && entry.clientCode)  existing.clientCode  = entry.clientCode;
          if (!existing.clientName  && entry.clientName)  existing.clientName  = entry.clientName;
        } else {
          recordsMap.set(entry.article, { ...entry });
        }
      }

      const records = Array.from(recordsMap.values());

      if (records.length === 0) {
        return res.status(400).json({
          error:
            'Aucune ligne valide trouvée. Vérifiez que le fichier contient des données dans les colonnes "article" et "quantité".',
        });
      }

      const created = await StockImportModel.createMany(records);
      // Recalculate FIFO allocation for each imported article
      const uniqueArticles = [...new Set(created.map(r => r.article.toUpperCase()))];
      for (const art of uniqueArticles) {
        await recalculateStockAllocation(art);
      }
      broadcast('stock-updated', { source: 'excel-import', articles: uniqueArticles, count: created.length });
      res.status(201).json({ imported: created.length, skipped, records: created });
    } catch (err) {
      console.error('Excel import error:', err);
      res.status(500).json({ error: "Erreur lors de l'importation du fichier: " + err.message });
    }
  },

  async getAll(req, res) {
    try {
      const articles = await StockImportModel.getAll();
      res.json(articles);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async createManual(req, res) {
    try {
      const { article, quantity, designation, clientCode, clientName } = req.body;
      const normalizedArticle = normalizeArticleCode(article);

      if (!normalizedArticle || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
        return res.status(400).json({ error: 'Article et quantité valides requis.' });
      }
      if (!isValidArticleCode(normalizedArticle)) {
        return res.status(400).json({ error: 'Code article invalide. Prefixes autorises: CI, CV, DI, DV, FC, FD, PL' });
      }

      const existing = await StockImportModel.findByArticle(normalizedArticle);
      const resolvedMode = existing ? 'add_stock' : 'new_product';

      const readyDate = calculateReadyDate(normalizedArticle, null);
      const { row, action } = await StockImportModel.upsertManual({
        article: normalizedArticle,
        quantity: Number(Number(quantity).toFixed(2)),
        designation: designation || null,
        clientCode: clientCode || null,
        clientName: clientName || null,
        readyDate,
      });
      // Recalculate FIFO allocation for this article
      await recalculateStockAllocation(row.article);
      broadcast('stock-updated', { source: 'manual', articles: [row.article], count: 1 });
      res.status(201).json({
        imported: 1,
        records: [row],
        action,
        mode: resolvedMode,
      });
    } catch (err) {
      console.error('Manual import error:', err);
      res.status(500).json({ error: "Erreur lors de l'ajout manuel: " + err.message });
    }
  },

  async getActiveTasks(req, res) {
    try {
      const stockId = parseInt(req.params.id, 10);
      if (!Number.isInteger(stockId) || stockId < 1) {
        return res.status(400).json({ error: 'ID stock invalide' });
      }

      const stock = await StockImportModel.findById?.(stockId);
      if (!stock) {
        return res.status(404).json({ error: 'Article non trouvé' });
      }

      const tasks = await TaskModel.getAll({});
      const activeTasks = tasks.filter(
        t => t.item_reference && t.item_reference.toUpperCase() === stock.article.toUpperCase() &&
             !['DONE'].includes(t.status)
      );

      res.json({
        stock,
        activeTasks: activeTasks.map(t => ({
          id: t.id,
          title: t.title,
          client_name: t.client_name,
          status: t.status,
          priority: t.priority,
          quantity: t.quantity,
          quantity_unit: t.quantity_unit,
          assigned_to_name: t.assigned_to_name,
        })),
      });
    } catch (err) {
      console.error('Get active tasks error:', err);
      res.status(500).json({ error: 'Erreur lors de la récupération des tâches' });
    }
  },

  /**
   * POST /api/stock-import/recalculate-all
   * Force recalculate FIFO allocation for every distinct article reference.
   * Useful after deploying the allocation fix on existing data.
   */
  async recalculateAll(req, res) {
    try {
      // Get all distinct article references from active tasks
      const allTasks = await TaskModel.getAll({
        statusIn: ['WAITING_STOCK', 'TODO', 'IN_PROGRESS', 'BLOCKED'],
      });
      const articles = [...new Set(
        allTasks
          .map(t => (t.item_reference || '').toUpperCase())
          .filter(Boolean)
      )];

      const { recalculateAllArticles } = require('../services/stockAllocationService');
      const processed = await recalculateAllArticles();
      res.json({ message: `Recalcul terminé pour ${processed} article(s)`, articles: processed });
    } catch (err) {
      console.error('Recalculate all error:', err);
      res.status(500).json({ error: 'Erreur lors du recalcul global' });
    }
  },

};

module.exports = stockImportController;
module.exports.calculateReadyDate = calculateReadyDate;
