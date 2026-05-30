const multer = require('multer');
const { createHttpError } = require('../utils/httpErrors');

// Taille maximale d'un fichier importé (10 Mo)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Types MIME et extensions acceptés pour les imports Excel / CSV
const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',                                          // .xls
  'application/octet-stream',                                          // navigateurs qui ne devinent pas le type
  'text/csv',
  'application/csv',
]);

const ALLOWED_EXTENSIONS = /\.(xlsx|xls|csv)$/i;

function excelFileFilter(_req, file, cb) {
  const mimeOk = ALLOWED_MIME_TYPES.has(file.mimetype);
  const extOk = ALLOWED_EXTENSIONS.test(file.originalname || '');
  if (mimeOk || extOk) {
    return cb(null, true);
  }
  // 415 Unsupported Media Type — capté par le gestionnaire d'erreurs global
  return cb(createHttpError(415, 'Format de fichier non autorisé. Utilisez un fichier Excel (.xlsx, .xls) ou CSV.'));
}

// Instance multer partagée par tous les imports de fichiers
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: excelFileFilter,
});

module.exports = {
  excelUpload,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  excelFileFilter,
};
