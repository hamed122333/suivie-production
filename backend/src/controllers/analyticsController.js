const pool = require('../config/db');
const { TASK_AGING_STATUSES } = require('../constants/task');

const ACTIVE_DAYS = 30; // un commercial est « actif » s'il a une commande < 30 jours

const CFD_DAYS = 30;        // fenêtre du Cumulative Flow Diagram
const THROUGHPUT_WEEKS = 8; // fenêtre du débit hebdomadaire
const LEADTIME_DAYS = 90;   // tâches livrées prises en compte pour cycle/lead time
const CFD_STATUSES = ['WAITING_STOCK', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'DELIVERED'];

function secsToDays(secs) {
  return Math.round((Number(secs) / 86400) * 10) / 10;
}

function median(sortedNums) {
  if (sortedNums.length === 0) return 0;
  const mid = Math.floor(sortedNums.length / 2);
  return sortedNums.length % 2 !== 0
    ? sortedNums[mid]
    : (sortedNums[mid - 1] + sortedNums[mid]) / 2;
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

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

  /**
   * Métriques de flux Kanban (page Analytics — super_admin / planner).
   * Tout dérive de task_history (transitions de statut déjà journalisées) + tasks.
   * Lecture seule, aucune écriture.
   *  - throughput   : nb de tâches livrées par semaine (8 dernières)
   *  - leadTime     : création → livraison ; cycleTime : 1re mise en production → livraison
   *  - timePerColumn: temps moyen passé dans chaque statut (intervalles terminés)
   *  - cfd          : nb de tâches par statut, jour par jour (30 j) — Cumulative Flow Diagram
   *  - aging        : tâches actives les plus anciennes dans leur colonne
   */
  async flowMetrics(req, res) {
    try {
      const [throughputRes, leadRes, colRes, agingRes, eventsRes, tasksRes] = await Promise.all([
        // Débit hebdomadaire
        pool.query(`
          SELECT date_trunc('week', created_at) AS week, COUNT(*)::int AS delivered
          FROM task_history
          WHERE action_type = 'status_changed' AND new_value = 'DELIVERED'
            AND created_at >= NOW() - ($1 || ' weeks')::interval
          GROUP BY week ORDER BY week
        `, [THROUGHPUT_WEEKS]),

        // Lead time (création → livraison) & cycle time (1re prod → livraison)
        pool.query(`
          WITH delivered AS (
            SELECT task_id, MAX(created_at) AS delivered_at
            FROM task_history
            WHERE action_type = 'status_changed' AND new_value = 'DELIVERED'
              AND created_at >= NOW() - ($1 || ' days')::interval
            GROUP BY task_id
          ),
          first_active AS (
            SELECT task_id, MIN(created_at) AS first_active_at
            FROM task_history
            WHERE action_type = 'status_changed'
              AND new_value IN ('TODO', 'WAITING_STOCK', 'IN_PROGRESS')
            GROUP BY task_id
          )
          SELECT
            EXTRACT(EPOCH FROM (d.delivered_at - t.created_at)) AS lead_secs,
            EXTRACT(EPOCH FROM (d.delivered_at - COALESCE(fa.first_active_at, t.created_at))) AS cycle_secs
          FROM delivered d
          JOIN tasks t ON t.id = d.task_id
          LEFT JOIN first_active fa ON fa.task_id = d.task_id
        `, [LEADTIME_DAYS]),

        // Temps moyen par colonne (intervalles entre transitions consécutives)
        pool.query(`
          WITH ev AS (
            SELECT task_id, new_value AS status, created_at,
              LEAD(created_at) OVER (PARTITION BY task_id ORDER BY created_at) AS next_at
            FROM task_history
            WHERE action_type = 'status_changed'
          )
          SELECT status,
                 AVG(EXTRACT(EPOCH FROM (next_at - created_at)))::float AS avg_secs,
                 COUNT(*)::int AS samples
          FROM ev
          WHERE next_at IS NOT NULL
          GROUP BY status
        `),

        // Aging WIP : cartes actives les plus anciennes dans leur colonne
        pool.query(`
          SELECT id, title, status, item_reference, status_changed_at,
                 EXTRACT(EPOCH FROM (NOW() - status_changed_at)) / 86400 AS days
          FROM tasks
          WHERE status = ANY($1)
          ORDER BY status_changed_at ASC NULLS LAST
          LIMIT 15
        `, [TASK_AGING_STATUSES]),

        // Transitions pour reconstruire le CFD (bornées à la fenêtre + leur historique)
        pool.query(`
          SELECT task_id, old_value, new_value, created_at
          FROM task_history
          WHERE action_type = 'status_changed'
          ORDER BY task_id, created_at
        `),

        // Tâches « board » pour seeder le CFD (statut courant + dates)
        pool.query(`
          SELECT id, status, created_at
          FROM tasks
          WHERE status <> 'PENDING_APPROVAL'
        `),
      ]);

      // --- Débit ---
      const throughput = throughputRes.rows.map((r) => ({
        week: isoDay(new Date(r.week)),
        delivered: Number(r.delivered) || 0,
      }));

      // --- Lead / Cycle time ---
      const leads = leadRes.rows.map((r) => Number(r.lead_secs)).filter((n) => n >= 0).sort((a, b) => a - b);
      const cycles = leadRes.rows.map((r) => Number(r.cycle_secs)).filter((n) => n >= 0).sort((a, b) => a - b);
      const avg = (arr) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0);
      const leadTime = {
        count: leads.length,
        avgDays: secsToDays(avg(leads)),
        medianDays: secsToDays(median(leads)),
      };
      const cycleTime = {
        count: cycles.length,
        avgDays: secsToDays(avg(cycles)),
        medianDays: secsToDays(median(cycles)),
      };

      // --- Temps par colonne ---
      const timePerColumn = CFD_STATUSES.map((status) => {
        const row = colRes.rows.find((r) => r.status === status);
        return {
          status,
          avgDays: row ? secsToDays(row.avg_secs) : 0,
          samples: row ? Number(row.samples) : 0,
        };
      });

      // --- Aging WIP ---
      const aging = agingRes.rows.map((r) => ({
        id: r.id,
        title: r.title,
        itemReference: r.item_reference,
        status: r.status,
        days: Math.round((Number(r.days) || 0) * 10) / 10,
      }));

      // --- CFD : reconstruction des statuts jour par jour ---
      // Timeline par tâche : statut initial = old_value de la 1re transition (ou statut courant si aucune).
      const transByTask = new Map();
      for (const ev of eventsRes.rows) {
        if (!transByTask.has(ev.task_id)) transByTask.set(ev.task_id, []);
        transByTask.get(ev.task_id).push(ev);
      }

      const today = new Date();
      const days = [];
      for (let i = CFD_DAYS - 1; i >= 0; i -= 1) {
        const d = new Date(today);
        d.setUTCHours(23, 59, 59, 999);
        d.setUTCDate(d.getUTCDate() - i);
        days.push(d);
      }

      const cfd = days.map((d) => {
        const counts = Object.fromEntries(CFD_STATUSES.map((s) => [s, 0]));
        for (const task of tasksRes.rows) {
          const createdAt = new Date(task.created_at);
          if (createdAt > d) continue; // pas encore créée ce jour-là
          const evs = transByTask.get(task.id) || [];
          // statut au soir du jour d : dernière transition <= d, sinon statut initial
          let status = evs.length ? evs[0].old_value : task.status;
          for (const ev of evs) {
            if (new Date(ev.created_at) <= d) status = ev.new_value;
            else break;
          }
          if (status && Object.prototype.hasOwnProperty.call(counts, status)) {
            counts[status] += 1;
          }
        }
        return { day: isoDay(d), ...counts };
      });

      res.json({
        throughput,
        leadTime,
        cycleTime,
        timePerColumn,
        aging,
        cfd,
        statuses: CFD_STATUSES,
        window: { cfdDays: CFD_DAYS, throughputWeeks: THROUGHPUT_WEEKS, leadTimeDays: LEADTIME_DAYS },
      });
    } catch (err) {
      console.error('analytics flowMetrics error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },
};

module.exports = analyticsController;
