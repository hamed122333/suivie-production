const ExcelJS = require('exceljs');
const StockMpModel = require('../models/stockMpModel');
const TaskModel = require('../models/taskModel');
const TaskHistoryModel = require('../models/taskHistoryModel');
const { isValidArticleCode, normalizeArticleCode } = require('../utils/articleCode');

async function autoPromoteWaitingTasksByArticles(articles, actorId) {
  const articleSet = new Set((articles || []).map((a) => `${a || ''}`.trim().toUpperCase()).filter(Boolean));
  if (articleSet.size === 0) return 0;

  const waitingTasks = await TaskModel.getAll({ status: 'WAITING_STOCK' });
  const candidates = waitingTasks.filter((task) => articleSet.has(`${task.item_reference || ''}`.trim().toUpperCase()));
  let promoted = 0;

  for (const task of candidates) {
    const stockAvailable = await StockMpModel.hasAvailableQuantity({
      stockMpId: task.stock_mp_id,
      itemReference: task.item_reference,
      requiredQuantity: task.quantity || 1,
    });
    if (!stockAvailable) continue;

    const moved = await TaskModel.updateStatus(task.id, 'TODO', null, actorId, 'planner', {
      systemAutoPromotion: true,
    });
    if (!moved) continue;
    promoted += 1;
    await TaskHistoryModel.log({
      taskId: moved.id,
      actorId,
      actionType: 'stock_confirmed',
      fieldName: 'stock_mp',
      message: 'Stock MP mis a jour puis fiche deplacee automatiquement vers A faire',
    });
  }

  return promoted;
}

async function autoPromoteAllWaitingTasks(actorId = null) {
  const waitingTasks = await TaskModel.getAll({ status: 'WAITING_STOCK' });
  let promoted = 0;
  for (const task of waitingTasks) {
    const stockAvailable = await StockMpModel.hasAvailableQuantity({
      stockMpId: task.stock_mp_id,
      itemReference: task.item_reference,
      requiredQuantity: task.quantity || 1,
    });
    if (!stockAvailable) continue;
    const moved = await TaskModel.updateStatus(task.id, 'TODO', null, actorId, 'planner', {
      systemAutoPromotion: true,
    });
    if (!moved) continue;
    promoted += 1;
    await TaskHistoryModel.log({
      taskId: moved.id,
      actorId,
      actionType: 'stock_confirmed',
      fieldName: 'stock_mp',
      message: 'Auto-check stock MP: fiche deplacee automatiquement vers A faire',
    });
  }
  return promoted;
}

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
 * Calculate the ready date based on article type rules for MP:
 *   MP → +7 days (matiere premiere standard)
 *   other → same day (0 days)
 *   Base date is taken from the file if provided, otherwise today.
 */
function calculateReadyDate(articleName, baseDateInput) {
  let date = new Date();

  if (baseDateInput) {
    if (baseDateInput instanceof Date) {
      date = new Date(baseDateInput);
    } else if (typeof baseDateInput === 'string') {
      const parts = baseDateInput.split(/[-\/]/);
      if (parts.length >= 3) {
        let day = parseInt(parts[0], 10);
        let month = parseInt(parts[1], 10);
        let year = parseInt(parts[2], 10);
        if (year < 100) year += 2000;
        date = new Date(year, month - 1, day);
      } else {
        const fallback = new Date(baseDateInput);
        if (!isNaN(fallback.getTime())) date = fallback;
      }
    }
  }

  if (isNaN(date.getTime())) {
     date = new Date();
  }

  const prefix = `${articleName || ''}`.trim().toUpperCase().slice(0, 2);
  let addDays = 0;
  if (prefix === 'MP') {
    addDays = 7;
  }

  if (addDays > 0) {
    date.setDate(date.getDate() + addDays);
  }

  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

const stockImportMpController = {
  async upload(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier fourni' });
      }

      const workbook = new ExcelJS.Workbook();
      try {
        await workbook.xlsx.load(req.file.buffer);
      } catch (xlsxErr) {
        try {
          const stream = require('stream');
          const bufferStream = new stream.PassThrough();
          bufferStream.end(req.file.buffer);
          await workbook.csv.read(bufferStream);
        } catch (csvErr) {
          throw new Error('Le fichier doit etre au format Excel (.xlsx) ou CSV valide');
        }
      }

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return res.status(400).json({
          error: 'Le fichier Excel est vide ou invalide'
        });
      }

      let headerRow = null;
      let headers = {};
      let headerRowNumber = 1;

      for (let r = 1; r <= 10; r++) {
        const row = worksheet.getRow(r);
        const tempHeaders = {};
        let foundArticle = false;

        row.eachCell((cell, colNumber) => {
          const rawValue = typeof cell.value === 'object' && cell.value !== null ? (cell.value.richText?.map(rt => rt.text).join('') || cell.value.result || '') : cell.value;
          const value = `${rawValue || ''}`.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
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
          error: 'Impossible de trouver la ligne d\'en-tete contenant "CODE ARTICLE" ou "ARTICLE".'
        });
      }

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
          if (quantity > existing.quantity) existing.quantity = quantity;
        } else {
          exactDedupMap.set(exactKey, { article, quantity, readyDate, designation, clientCode, clientName });
        }
      });

      const recordsMap = new Map();
      for (const entry of exactDedupMap.values()) {
        const existing = recordsMap.get(entry.article);
        if (existing) {
          existing.quantity    = Number((existing.quantity + entry.quantity).toFixed(2));
          if (entry.readyDate > existing.readyDate) existing.readyDate = entry.readyDate;
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
            'Aucune ligne valide trouvee. Verifiez que le fichier contient des donnees dans les colonnes "article" et "quantite".',
        });
      }

      const created = await StockMpModel.createMany(records);
      const promotedTasks = await autoPromoteWaitingTasksByArticles(
        created.map((row) => row.article),
        req.user?.id || null
      );
      res.status(201).json({ imported: created.length, skipped, records: created, promotedTasks });
    } catch (err) {
      console.error('Excel import MP error:', err);
      res.status(500).json({ error: "Erreur lors de l'importation du fichier MP: " + err.message });
    }
  },

  async getAll(req, res) {
    try {
      const articles = await StockMpModel.getAll();
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
        return res.status(400).json({ error: 'Article et quantite valides requis.' });
      }
      if (!isValidArticleCode(normalizedArticle)) {
        return res.status(400).json({ error: 'Code article invalide. Prefixes autorises: CI, CV, DI, DV, FC, FD, PL, MP' });
      }

      const existing = await StockMpModel.findByArticle(normalizedArticle);
      const resolvedMode = existing ? 'add_stock' : 'new_product';

      const readyDate = calculateReadyDate(normalizedArticle, null);
      const { row, action } = await StockMpModel.upsertManual({
        article: normalizedArticle,
        quantity: Number(Number(quantity).toFixed(2)),
        designation: designation || null,
        clientCode: clientCode || null,
        clientName: clientName || null,
        readyDate,
      });
      const promotedTasks = await autoPromoteWaitingTasksByArticles(
        [row.article],
        req.user?.id || null
      );
      res.status(201).json({
        imported: 1,
        records: [row],
        promotedTasks,
        action,
        mode: resolvedMode,
      });
    } catch (err) {
      console.error('Manual MP import error:', err);
      res.status(500).json({ error: "Erreur lors de l'ajout manuel MP: " + err.message });
    }
  },

  async getActiveTasks(req, res) {
    try {
      const stockId = parseInt(req.params.id, 10);
      if (!Number.isInteger(stockId) || stockId < 1) {
        return res.status(400).json({ error: 'ID stock MP invalide' });
      }

      const stock = await StockMpModel.findById?.(stockId);
      if (!stock) {
        return res.status(404).json({ error: 'Article MP non trouve' });
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
      console.error('Get active MP tasks error:', err);
      res.status(500).json({ error: 'Erreur lors de la recuperation des taches' });
    }
  },
};

module.exports = stockImportMpController;
module.exports.calculateReadyDate = calculateReadyDate;
module.exports.autoPromoteAllWaitingTasks = autoPromoteAllWaitingTasks;
