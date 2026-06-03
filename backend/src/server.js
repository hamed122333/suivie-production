const app = require('./app');
const { recalculateAllArticles } = require('./services/stockAllocationService');

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// Daily FIFO recalculation — catches any missed updates
const AUTO_RECALC_INTERVAL_MS = 24 * 60 * 60 * 1000;

const recalcTimer = setInterval(async () => {
  try {
    const processed = await recalculateAllArticles();
    if (processed > 0) {
      console.log(`[Cron] FIFO recalculation completed for ${processed} article(s)`);
    }
  } catch (error) {
    console.error('[Cron] FIFO recalculation failed:', error.message);
  }
}, AUTO_RECALC_INTERVAL_MS);

// ── Robustesse process (évite les downtime silencieux sur Render mono-instance) ──
// Une promesse rejetée non gérée ferait crasher Node (≥ v15) sans ces handlers.
// On journalise sans tuer le process pour les rejets ; on arrête proprement sur
// exception vraiment fatale afin que Render redémarre une instance saine.
process.on('unhandledRejection', (reason) => {
  console.error('[process] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[process] Uncaught exception:', err);
  // Erreur potentiellement corruptrice : on arrête proprement, Render relance.
  shutdown('uncaughtException', 1);
});

// Arrêt gracieux : Render envoie SIGTERM au spin-down / redéploiement.
let shuttingDown = false;
function shutdown(signal, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[process] ${signal} reçu — arrêt gracieux…`);
  clearInterval(recalcTimer);
  server.close(() => {
    console.log('[process] Serveur HTTP fermé.');
    process.exit(code);
  });
  // Filet de sécurité : forcer la sortie si les connexions traînent.
  setTimeout(() => process.exit(code), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
