const multer = require('multer');
const { MAX_FILE_SIZE } = require('./upload');

/**
 * Gestionnaire d'erreurs global — dernier middleware monté.
 *
 * Garantit qu'aucune erreur utilisateur prévisible ne produit un 500 :
 * - erreurs Multer (taille, champ inattendu) → 4xx
 * - erreurs HTTP explicites (createHttpError) → leur statut
 * - JSON malformé (body-parser) → 400
 * - tout le reste → 500 générique (les détails sont journalisés, jamais exposés)
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (!err) return next();

  // Réponse déjà envoyée → déléguer au handler par défaut d'Express
  if (res.headersSent) return next(err);

  // 1) Erreurs Multer (upload de fichier)
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const mo = Math.round(MAX_FILE_SIZE / (1024 * 1024));
      return res.status(413).json({ error: `Fichier trop volumineux (maximum ${mo} Mo).` });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Champ de fichier inattendu. Utilisez le champ « file ».' });
    }
    return res.status(400).json({ error: `Erreur de téléversement : ${err.message}` });
  }

  // 2) JSON malformé dans le corps de la requête (body-parser)
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return res.status(400).json({ error: 'Corps de requête JSON invalide.' });
  }

  // 3) Erreurs HTTP explicites (createHttpError, fileFilter, etc.)
  if (Number.isInteger(err.status) && err.status >= 400 && err.status < 600) {
    return res.status(err.status).json({ error: err.message || 'Requête invalide.' });
  }

  // 4) Erreur inattendue — journaliser sans exposer les détails
  console.error('[errorHandler] Unhandled error:', err);
  return res.status(500).json({ error: 'Erreur serveur interne. Veuillez réessayer plus tard.' });
}

module.exports = errorHandler;
