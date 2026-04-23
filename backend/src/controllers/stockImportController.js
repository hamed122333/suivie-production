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

      const recordsMap = new Map();

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowNumber) return; // skip headers and above

        const articleCell = row.getCell(articleColIdx);
        const quantityCell = row.getCell(quantityColIdx);

        // Date might not be present
        let rawDate = null;
        if (dateColIdx !== null) {
           const dateCell = row.getCell(dateColIdx);
           rawDate = dateCell.value;
        }

        let designation = null;
        if (designationColIdx !== null) {
          const rawDesig = row.getCell(designationColIdx).value;
          designation = `${typeof rawDesig === 'object' && rawDesig !== null ? (rawDesig.richText?.map(rt => rt.text).join('') || rawDesig.result || '') : (rawDesig ?? '')}`.trim() || null;
        }

        let clientCode = null;
        if (clientCodeColIdx !== null) {
          const rawCc = row.getCell(clientCodeColIdx).value;
          clientCode = `${typeof rawCc === 'object' && rawCc !== null ? (rawCc.richText?.map(rt => rt.text).join('') || rawCc.result || '') : (rawCc ?? '')}`.trim() || null;
        }

        let clientName = null;
        if (clientNameColIdx !== null) {
          const rawCn = row.getCell(clientNameColIdx).value;
          clientName = `${typeof rawCn === 'object' && rawCn !== null ? (rawCn.richText?.map(rt => rt.text).join('') || rawCn.result || '') : (rawCn ?? '')}`.trim() || null;
        }

        const rawArticle = typeof articleCell.value === 'object' && articleCell.value !== null ? (articleCell.value.richText?.map(rt => rt.text).join('') || articleCell.value.result || '') : articleCell.value;
        const article = `${rawArticle ?? ''}`.trim();
        const quantity = extractCellNumber(quantityCell);

        if (!article || !Number.isFinite(quantity) || quantity <= 0) return;

        const readyDate = calculateReadyDate(article, rawDate);
        const normalizedArticle = article.toUpperCase();

        if (recordsMap.has(normalizedArticle)) {
            // Remplacer l'état dupliqué avec le nouveau flux du fichier
            const existing = recordsMap.get(normalizedArticle);
            existing.quantity = Number(quantity.toFixed(2));
            existing.readyDate = readyDate;
            if (designation) existing.designation = designation;
            if (clientCode) existing.clientCode = clientCode;
            if (clientName) existing.clientName = clientName;
        } else {
            recordsMap.set(normalizedArticle, {
                article,
                quantity: Number(quantity.toFixed(2)),
                readyDate,
                designation,
                clientCode,
                clientName
            });
        }
      });

      const records = Array.from(recordsMap.values());

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

  async createManual(req, res) {
    try {
      const { article, quantity, baseDate } = req.body;

      if (!article || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
        return res.status(400).json({ error: 'Article et quantité valides requis.' });
      }

      const readyDate = calculateReadyDate(article, baseDate);
      const normalizedArticle = article.trim().toUpperCase();

      const records = [{
        article: normalizedArticle,
        quantity: Number(Number(quantity).toFixed(2)),
        readyDate
      }];

      const created = await StockImportModel.createMany(records);
      res.status(201).json({ imported: created.length, records: created });
    } catch (err) {
      console.error('Manual import error:', err);
      res.status(500).json({ error: "Erreur lors de l'ajout manuel: " + err.message });
    }
  }
};

module.exports = stockImportController;
module.exports.calculateReadyDate = calculateReadyDate;
