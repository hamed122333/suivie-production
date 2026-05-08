const app = require('./app');
const { recalculateAllArticles } = require('./services/stockAllocationService');

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// Daily FIFO recalculation — catches any missed updates
const AUTO_RECALC_INTERVAL_MS = 24 * 60 * 60 * 1000;

setInterval(async () => {
  try {
    const processed = await recalculateAllArticles();
    if (processed > 0) {
      console.log(`[Cron] FIFO recalculation completed for ${processed} article(s)`);
    }
  } catch (error) {
    console.error('[Cron] FIFO recalculation failed:', error.message);
  }
}, AUTO_RECALC_INTERVAL_MS);

module.exports = server;
