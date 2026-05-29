const UserModel = require('../models/userModel');
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');

const VALID_ROLES = ['super_admin', 'planner', 'commercial', 'user'];
const COMMERCIAL_ID_REGEX = /^VL\d{6}$/;

// Helper: normalize column header
function normalizeHeaderLabel(label) {
  if (!label) return '';
  return `${label}`.toLowerCase().trim().replace(/\s+/g, ' ');
}

const userController = {
  async getAll(req, res) {
    try {
      const users = await UserModel.getAll();
      res.json(users);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async create(req, res) {
    try {
      const { name, email, password, role, commercialId } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Le nom est obligatoire' });
      }
      if (!email || !email.trim()) {
        return res.status(400).json({ error: 'L\'email est obligatoire' });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
      }

      const assignedRole = VALID_ROLES.includes(role) ? role : 'user';

      if (assignedRole === 'commercial') {
        if (!commercialId || !COMMERCIAL_ID_REGEX.test(commercialId)) {
          return res.status(400).json({ error: 'L\'ID commercial doit être au format VL000001' });
        }
        const existingId = await UserModel.findByCommercialId(commercialId);
        if (existingId) {
          return res.status(409).json({ error: 'Cet ID commercial est déjà utilisé' });
        }
      }

      const existing = await UserModel.findByEmail(email.trim().toLowerCase());
      if (existing) {
        return res.status(409).json({ error: 'Cet email est déjà utilisé' });
      }

      const user = await UserModel.create(
        name.trim(),
        email.trim().toLowerCase(),
        password,
        assignedRole,
        assignedRole === 'commercial' ? commercialId : null
      );
      res.status(201).json(user);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async importCommercials(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier fourni' });
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return res.status(400).json({ error: 'Fichier Excel invalide' });
      }

      // Extract headers from row 1
      const headers = {};
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell, col) => {
        const key = normalizeHeaderLabel(cell.value);
        headers[key] = col;
      });

      // Find code and name columns
      let codeCol = null;
      let nameCol = null;
      for (const [normalized, col] of Object.entries(headers)) {
        if (normalized.includes('code') && !normalized.includes('name')) {
          codeCol = col;
        }
        if (normalized.includes('nom') || normalized.includes('name')) {
          nameCol = col;
        }
      }

      // If not found with normalization, try exact positions (A=1, B=2)
      if (!codeCol) codeCol = 1;
      if (!nameCol) nameCol = 2;

      const results = {
        imported: 0,
        updated: 0,
        skipped: 0,
        errors: [],
        duplicates: [],
      };

      const processedCodes = new Set();
      const importTasks = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        const rawCode = row.getCell(codeCol).value;
        const rawName = row.getCell(nameCol).value;

        // Validate code
        if (!rawCode) {
          results.skipped += 1;
          return;
        }

        const code = `${rawCode}`.trim().toUpperCase();
        const name = rawName ? `${rawName}`.trim() : '';

        // Validate format
        if (!COMMERCIAL_ID_REGEX.test(code)) {
          results.errors.push(`Ligne ${rowNumber}: Code invalide "${code}" (attendu: VL000001)`);
          return;
        }

        // Check duplicate within this import
        if (processedCodes.has(code)) {
          results.duplicates.push(`Code ${code} (${name}) — doublon dans l'import`);
          return;
        }
        processedCodes.add(code);

        // Add async task to queue
        const task = (async () => {
          try {
            const existing = await UserModel.findByCommercialId(code);
            if (existing) {
              results.updated += 1;
              return;
            }

            // Create new commercial user
            const tempPassword = Math.random().toString(36).substring(2, 10);
            const email = `${code.toLowerCase()}@commercials.internal`;

            await UserModel.create(
              name || code,
              email,
              tempPassword,
              'commercial',
              code
            );
            results.imported += 1;
          } catch (err) {
            results.errors.push(`Ligne ${rowNumber}: ${err.message}`);
          }
        })();

        importTasks.push(task);
      });

      // Wait for all async operations to complete
      await Promise.all(importTasks);

      return res.status(201).json({
        imported: results.imported,
        updated: results.updated,
        skipped: results.skipped,
        errors: results.errors,
        duplicates: results.duplicates,
        message: `${results.imported} commerciaux importés, ${results.updated} mis à jour, ${results.skipped} sautés`,
      });
    } catch (err) {
      console.error('Commercial import failed:', err);
      return res.status(500).json({ error: `Erreur import commerciaux: ${err.message}` });
    }
  },

  async delete(req, res) {
    try {
      const u = await UserModel.delete(req.params.id);
      res.json({ message: 'Compte supprime' });
    } catch (err) {
      if (err.message.includes('introuvable')) {
         return res.status(404).json({ error: err.message });
      }
      res.status(500).json({ error: 'Erreur lors de la suppression du compte' });
    }
  },
};

module.exports = userController;
