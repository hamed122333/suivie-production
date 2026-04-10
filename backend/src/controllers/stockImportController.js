const ExcelJS = require('exceljs');
const StockImportModel = require('../models/stockImportModel');

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
  const name = `${articleName || ''}`.trim().toLowerCase();
  let daysToAdd = 0;

  if (name.startsWith('cv') || name.startsWith('ci')) {
    daysToAdd = 6;
  } else if (name.startsWith('di') || name.startsWith('dv')) {
    daysToAdd = 9;
  } else if (name.startsWith('pl')) {
    daysToAdd = 4;
  }

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

  // Add the delayed days
  date.setDate(date.getDate() + daysToAdd);
  
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
      const dateCandidates = ['date', 'dates', 'date_import', 'jour'];

      let articleColIdx = null;
      let quantityColIdx = null;
      let dateColIdx = null;

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

      if (articleColIdx === null || quantityColIdx === null) {
        return res.status(400).json({
          error:
            'Colonnes introuvables. Le fichier doit contenir au moins les colonnes "article" et "quantité". (La colonne "date" est optionnelle)',
        });
      }

      const records = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header

        const articleCell = row.getCell(articleColIdx);
        const quantityCell = row.getCell(quantityColIdx);
        
        // Date might not be present
        let rawDate = null;
        if (dateColIdx !== null) {
           const dateCell = row.getCell(dateColIdx);
           rawDate = dateCell.value;
        }

        const article = `${articleCell.value ?? ''}`.trim();
        const quantity = extractCellNumber(quantityCell);

        if (!article || !Number.isFinite(quantity) || quantity <= 0) return;

        records.push({
          article,
          quantity: Number(quantity.toFixed(2)),
          readyDate: calculateReadyDate(article, rawDate),
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
};

module.exports = stockImportController;
module.exports.calculateReadyDate = calculateReadyDate;
