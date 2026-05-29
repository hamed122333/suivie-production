const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production');
}

const hasRole = (userRole, allowed) => userRole === 'super_admin' || allowed.includes(userRole);

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  const token = authHeader.split(' ')[1];
  const secret = JWT_SECRET || 'dev_secret_key_do_not_use_in_production';
  try {
    const decoded = jwt.verify(token, secret);
    // Refresh user data from DB so stale tokens get fresh role/commercial_id
    const result = await pool.query(
      'SELECT id, name, email, role, commercial_id FROM users WHERE id = $1',
      [decoded.id]
    );
    if (!result.rows[0]) {
      return res.status(401).json({ error: 'Utilisateur introuvable' });
    }
    req.user = result.rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide' });
  }
};

const requireRoles = (roles, errorMessage = 'Acces refuse') => (req, res, next) => {
  if (!req.user?.role || !hasRole(req.user.role, roles)) {
    return res.status(403).json({ error: errorMessage });
  }
  next();
};

const requireSuperAdmin = requireRoles(['super_admin'], 'Acces super administrateur requis');
const requirePlanner = requireRoles(['planner'], 'Acces planificateur requis');
const requireSuperAdminOrPlanner = requireRoles(['super_admin', 'planner'], 'Acces planificateur ou super administrateur requis');
const requireCommercial = (req, res, next) => {
  if (req.user?.role !== 'commercial') {
    return res.status(403).json({ error: 'Acces commercial requis' });
  }
  next();
};
const requireAnyRole = requireRoles(['super_admin', 'planner', 'commercial', 'user'], 'Authentification requise');
// Livreur (delivery driver) or super_admin can mark tasks as DELIVERED
const requireLivreur = requireRoles(['livreur'], 'Acces livreur requis');

module.exports = { authenticate, requireRoles, requireSuperAdmin, requirePlanner, requireSuperAdminOrPlanner, requireCommercial, requireAnyRole, requireLivreur };
