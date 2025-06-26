const jwt = require('jsonwebtoken');
const { query } = require('../database/connection');
const logger = require('../utils/logger');

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
async function auth(req, res, next) {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Access token required' });
        }
        
        const token = authHeader.substring(7);
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if user still exists and is active
        const userResult = await query(
            'SELECT id, username, email, role, is_active FROM users WHERE id = $1',
            [decoded.id]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        const user = userResult.rows[0];
        
        if (!user.is_active) {
            return res.status(401).json({ error: 'Account is disabled' });
        }
        
        // Attach user to request
        req.user = user;
        next();
        
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        
        logger.error('Authentication middleware error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Authorization middleware
 * Checks if user has required role
 */
function authorize(roles = []) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        if (roles.length === 0) {
            return next();
        }
        
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        
        next();
    };
}

/**
 * Admin only middleware
 */
function adminOnly(req, res, next) {
    return authorize(['admin'])(req, res, next);
}

/**
 * Manager or admin middleware
 */
function managerOrAdmin(req, res, next) {
    return authorize(['admin', 'manager'])(req, res, next);
}

module.exports = {
    auth,
    authorize,
    adminOnly,
    managerOrAdmin
};
