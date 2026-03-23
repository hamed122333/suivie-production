const jwt = require('jsonwebtoken');

const hasRole = (userRole, allowed) => allowed.includes(userRole);

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const requireRoles = (roles, errorMessage = 'Access denied') => (req, res, next) => {
  if (!req.user?.role || !hasRole(req.user.role, roles)) {
    return res.status(403).json({ error: errorMessage });
  }
  next();
};

const requireSuperAdmin = requireRoles(['super_admin'], 'Super admin access required');
const requirePlanner = requireRoles(['planner'], 'Planner access required');
const requireSuperAdminOrPlanner = requireRoles(['super_admin', 'planner'], 'Planner or super admin access required');

module.exports = { authenticate, requireRoles, requireSuperAdmin, requirePlanner, requireSuperAdminOrPlanner };
