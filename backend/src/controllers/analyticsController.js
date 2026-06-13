const pool = require('../config/db');

const ACTIVE_DAYS = 30; // un commercial est « actif » s'il a une commande < 30 jours

const analyticsController = {
  /**
   * Performance commerciale (page Analytics — super_admin).
   * Liste TOUS les comptes commerciaux (y compris ceux sans commande = inactifs)
   * avec leurs agrégats, + un résumé global. Lecture seule.
   */
  async commercialPerformance(req, res) {
    try {
      const result = await pool.query(`
        SELECT
          u.id,
          u.name,
          u.commercial_id,
          COALESCE(s.total_orders, 0)::int    AS total_orders,
          COALESCE(s.pending, 0)::int         AS pending,
          COALESCE(s.validated, 0)::int       AS validated,
          COALESCE(s.delivered, 0)::int       AS delivered,
          COALESCE(s.total_quantity, 0)::numeric AS total_quantity,
          s.last_order_at
        FROM users u
        LEFT JOIN (
          SELECT
            t.commercial_id AS cid,
            COUNT(*)                                              AS total_orders,
            COUNT(*) FILTER (WHERE t.status = 'PENDING_APPROVAL') AS pending,
            COUNT(*) FILTER (WHERE t.status <> 'PENDING_APPROVAL') AS validated,
            COUNT(*) FILTER (WHERE t.status = 'DELIVERED')        AS delivered,
            SUM(t.quantity)                                       AS total_quantity,
            MAX(t.created_at)                                     AS last_order_at
          FROM tasks t
          WHERE t.commercial_id IS NOT NULL
          GROUP BY t.commercial_id
        ) s ON s.cid = u.commercial_id
        WHERE u.role = 'commercial'
        ORDER BY validated DESC NULLS LAST, total_orders DESC
      `);

      const now = Date.now();
      const activeMs = ACTIVE_DAYS * 24 * 60 * 60 * 1000;

      const commercials = result.rows.map((r) => {
        const total = Number(r.total_orders) || 0;
        const validated = Number(r.validated) || 0;
        const lastOrderAt = r.last_order_at ? new Date(r.last_order_at) : null;
        const active = lastOrderAt ? (now - lastOrderAt.getTime()) <= activeMs : false;
        const validationRate = total > 0 ? Math.round((validated / total) * 100) : 0;
        return {
          id: r.id,
          name: r.name,
          commercialId: r.commercial_id,
          totalOrders: total,
          pending: Number(r.pending) || 0,
          validated,
          delivered: Number(r.delivered) || 0,
          totalQuantity: Math.round(Number(r.total_quantity) || 0),
          lastOrderAt: r.last_order_at,
          active,
          validationRate,
        };
      });

      const summary = {
        commercialsCount: commercials.length,
        activeCount: commercials.filter((c) => c.active).length,
        inactiveCount: commercials.filter((c) => !c.active).length,
        totalOrders: commercials.reduce((s, c) => s + c.totalOrders, 0),
        totalValidated: commercials.reduce((s, c) => s + c.validated, 0),
        totalPending: commercials.reduce((s, c) => s + c.pending, 0),
        totalDelivered: commercials.reduce((s, c) => s + c.delivered, 0),
        activeDays: ACTIVE_DAYS,
        bestCommercial: commercials.find((c) => c.validated > 0) || null, // déjà trié par validated DESC
      };

      res.json({ commercials, summary });
    } catch (err) {
      console.error('analytics commercialPerformance error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },
};

module.exports = analyticsController;
