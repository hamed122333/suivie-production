const xlsx = require('xlsx');
const pool = require('../config/db');

const DATE_HEADER = 'DATE ENTREE EN STOCK';
const ITEM_CODE_HEADER = 'CODE ARTICLE';
const DESIGNATION_HEADER = 'DESIGNATION ARTICLE';
const CLIENT_CODE_HEADER = 'CLIENT';
const CLIENT_NAME_HEADER = 'NOMCLIENT';
const QUANTITY_HEADER = 'SOMME DE QUANTITE';
const AGE_HEADER = 'AGE';

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (value === null || value === undefined) return NaN;
  const normalized = String(value).replace(/\s/g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseDate(value) {
  if (!value && value !== 0) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  if (typeof value === 'number') {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  const text = String(value).trim();
  if (!text) return null;

  const ddMmYyyy = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/;
  const match = text.match(ddMmYyyy);
  if (match) {
    const day = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    let year = Number.parseInt(match[3], 10);
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const parsedDate = new Date(text);
  if (!Number.isNaN(parsedDate.getTime())) {
    return `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`;
  }

  return null;
}

const stockController = {
  async importStock(req, res) {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni.' });
    }

    let rows;
    try {
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        return res.status(400).json({ error: 'Le fichier est vide.' });
      }
      const worksheet = workbook.Sheets[firstSheetName];
      rows = xlsx.utils.sheet_to_json(worksheet, { defval: null, raw: true });
    } catch (error) {
      return res.status(400).json({ error: 'Fichier Excel/CSV invalide.' });
    }

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'Aucune donnée trouvée dans le fichier.' });
    }

    const normalizedRows = rows.map((row) =>
      Object.entries(row).reduce((acc, [key, value]) => {
        acc[normalizeHeader(key)] = value;
        return acc;
      }, {})
    );

    const valuesToUpsert = [];
    let skippedCount = 0;
    for (const row of normalizedRows) {
      const entryDate = parseDate(row[DATE_HEADER]);
      const itemCode = String(row[ITEM_CODE_HEADER] || '').trim();
      const designation = String(row[DESIGNATION_HEADER] || '').trim() || null;
      const clientCode = String(row[CLIENT_CODE_HEADER] || '').trim();
      const clientName = String(row[CLIENT_NAME_HEADER] || '').trim() || null;
      const quantity = parseNumber(row[QUANTITY_HEADER]);
      const ageValue = parseNumber(row[AGE_HEADER]);
      const age = Number.isFinite(ageValue) ? Math.trunc(ageValue) : null;

      if (!entryDate || !itemCode || !clientCode || !Number.isFinite(quantity)) {
        skippedCount += 1;
        continue;
      }

      valuesToUpsert.push({
        entryDate,
        itemCode,
        designation,
        clientCode,
        clientName,
        quantity,
        age,
      });
    }

    if (valuesToUpsert.length === 0) {
      return res.status(400).json({ error: 'Aucune ligne valide à importer.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const upsertQuery = `
        INSERT INTO finished_product_stock
          (entry_date, item_code, designation, client_code, client_name, quantity, age)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (item_code, entry_date, client_code)
        DO UPDATE SET
          designation = EXCLUDED.designation,
          client_name = EXCLUDED.client_name,
          quantity = EXCLUDED.quantity,
          age = EXCLUDED.age
      `;

      for (const item of valuesToUpsert) {
        await client.query(upsertQuery, [
          item.entryDate,
          item.itemCode,
          item.designation,
          item.clientCode,
          item.clientName,
          item.quantity,
          item.age,
        ]);
      }

      await client.query('COMMIT');
      return res.status(200).json({
        message: 'Importation du stock terminée.',
        importedCount: valuesToUpsert.length,
        skippedCount,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Stock import error:', error);
      return res.status(500).json({ error: "Erreur lors de l'importation du stock." });
    } finally {
      client.release();
    }
  },
};

module.exports = stockController;
