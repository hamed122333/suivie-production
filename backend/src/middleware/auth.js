const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production');
}

const hasRole = (userRole, allowed) => userRole === 'super_admin' || allowed.includes(userRole);

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  const token = authHeader.split(' ')[1];
  const secret = JWT_SECRET || 'dev_secret_key_do_not_use_in_production';
  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
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

module.exports = { authenticate, requireRoles, requireSuperAdmin, requirePlanner, requireSuperAdminOrPlanner, requireCommercial, requireAnyRole };
