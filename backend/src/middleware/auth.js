const jwt = require('jsonwebtoken');

const hasRole = (userRole, allowed) => userRole === 'super_admin' || allowed.includes(userRole);

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
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
