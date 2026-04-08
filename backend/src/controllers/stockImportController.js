const ExcelJS = require('exceljs');
const StockImportModel = require('../models/stockImportModel');

/**
 * Calculate the ready date based on article type rules:
 *   ci / cvc  → +7 days
 *   di        → +10 days
 *   pl        → +5 days
 *   other     → same day (0 days)
 */
function calculateReadyDate(articleName) {
  const name = `${articleName || ''}`.trim().toLowerCase();
  let daysToAdd = 0;

  if (name.startsWith('cvc') || name.startsWith('ci')) {
    daysToAdd = 7;
  } else if (name.startsWith('di')) {
    daysToAdd = 10;
  } else if (name.startsWith('pl')) {
    daysToAdd = 5;
  }

  const date = new Date();
  date.setDate(date.getDate() + daysToAdd);
  return date.toISOString().slice(0, 10);
}

/**
 * Find a column key in a row object, searching case-insensitively by candidate names.
 */
function findColumnKey(row, candidates) {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const found = keys.find((k) => k.trim().toLowerCase() === candidate.toLowerCase());
    if (found !== undefined) return found;
  }
  // Fallback: partial match
  for (const candidate of candidates) {
    const found = keys.find((k) => k.trim().toLowerCase().includes(candidate.toLowerCase()));
    if (found !== undefined) return found;
  }
  return null;
}

const stockImportController = {
  async upload(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier fourni' });
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return res.status(400).json({ error: 'Le fichier Excel est vide ou invalide' });
      }

      // Read header row to identify column indices
      const headerRow = worksheet.getRow(1);
      const headers = {};
      headerRow.eachCell((cell, colNumber) => {
        const value = `${cell.value || ''}`.trim().toLowerCase();
        headers[value] = colNumber;
      });

      // Resolve article and quantity column indices
      const articleCandidates = ['article', 'articles', 'ref', 'reference', 'désignation', 'designation'];
      const quantityCandidates = ['quantité', 'quantite', 'qté', 'qte', 'qty', 'quantity', 'quantités', 'quantites'];

      let articleColIdx = null;
      let quantityColIdx = null;

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

      if (articleColIdx === null || quantityColIdx === null) {
        return res.status(400).json({
          error:
            'Colonnes introuvables. Le fichier doit contenir les colonnes "article" et "quantité".',
        });
      }

      const records = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header

        const articleCell = row.getCell(articleColIdx);
        const quantityCell = row.getCell(quantityColIdx);

        const article = `${articleCell.value ?? ''}`.trim();
        const rawQty = quantityCell.value;
        const quantity = typeof rawQty === 'object' && rawQty !== null ? parseFloat(rawQty.result ?? rawQty) : parseFloat(rawQty);

        if (!article || !Number.isFinite(quantity) || quantity <= 0) return;

        records.push({
          article,
          quantity: Number(quantity.toFixed(2)),
          readyDate: calculateReadyDate(article),
        });
      });

      if (records.length === 0) {
        return res.status(400).json({
          error:
            'Aucune ligne valide trouvée. Vérifiez que le fichier contient des données dans les colonnes "article" et "quantité".',
        });
      }

      const created = await StockImportModel.createMany(records);
      res.status(201).json({ imported: created.length, records: created });
    } catch (err) {
      console.error('Excel import error:', err);
      res.status(500).json({ error: "Erreur lors de l'importation du fichier" });
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
};

module.exports = stockImportController;
module.exports.calculateReadyDate = calculateReadyDate;
module.exports.findColumnKey = findColumnKey;
