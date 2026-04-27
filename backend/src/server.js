const app = require('./app');
const { autoPromoteAllWaitingTasks } = require('./controllers/stockImportController');

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

const AUTO_PROMOTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

setInterval(async () => {
  try {
    const promoted = await autoPromoteAllWaitingTasks(null);
    if (promoted > 0) {
      console.log(`Auto promotion moved ${promoted} WAITING_STOCK task(s) to TODO`);
    }
  } catch (error) {
    console.error('Auto promotion failed:', error.message);
  }
}, AUTO_PROMOTION_INTERVAL_MS);

module.exports = server;
