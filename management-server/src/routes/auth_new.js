const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../database/connection');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: { error: 'Too many login attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 registrations per hour per IP
    message: { error: 'Too many registration attempts, please try again later' }
});

// Validation rules
const loginValidation = [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required')
];

const registerValidation = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('Username must be between 3 and 50 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers, and underscores'),
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email is required'),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    body('firstName')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage('First name must be less than 50 characters'),
    body('lastName')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage('Last name must be less than 50 characters')
];

// Helper function to generate JWT token
function generateToken(user) {
    return jwt.sign(
        { 
            id: user.id, 
            username: user.username, 
            email: user.email, 
            role: user.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
}

// Helper function to create user session
async function createUserSession(userId, token, req) {
    const sessionId = uuidv4();
    const tokenHash = await bcrypt.hash(token, 8);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    await query(
        `INSERT INTO user_sessions (id, user_id, token_hash, expires_at, user_agent, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sessionId, userId, tokenHash, expiresAt, req.headers['user-agent'], req.ip]
    );
    
    return sessionId;
}

// POST /api/auth/register - Register new user (admin only for now)
router.post('/register', registerLimiter, registerValidation, async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { username, email, password, firstName, lastName } = req.body;

        // Check if user already exists
        const existingUser = await query(
            'SELECT id FROM users WHERE username = $1 OR email = $2',
            [username, email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({ 
                error: 'User already exists with this username or email' 
            });
        }

        // Hash password
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Create user
        const result = await query(
            `INSERT INTO users (username, email, password_hash, first_name, last_name, role, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, username, email, first_name, last_name, role, created_at`,
            [username, email, passwordHash, firstName || null, lastName || null, 'user', true]
        );

        const user = result.rows[0];

        // Generate token
        const token = generateToken(user);
        
        // Create session
        const sessionId = await createUserSession(user.id, token, req);

        logger.info(`User registered successfully: ${username}`, { 
            userId: user.id, 
            sessionId 
        });

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role,
                createdAt: user.created_at
            },
            token,
            sessionId
        });

    } catch (error) {
        logger.error('Registration error:', error);
        next(error);
    }
});

// POST /api/auth/login - User login
router.post('/login', authLimiter, loginValidation, async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { username, password } = req.body;

        // Find user
        const result = await query(
            `SELECT id, username, email, password_hash, first_name, last_name, role, is_active
             FROM users 
             WHERE username = $1 OR email = $1`,
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        if (!user.is_active) {
            return res.status(401).json({ error: 'Account is disabled' });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            logger.warn(`Failed login attempt for user: ${username}`, { 
                ip: req.ip,
                userAgent: req.headers['user-agent']
            });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last login
        await query(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
        );

        // Generate token
        const token = generateToken(user);
        
        // Create session
        const sessionId = await createUserSession(user.id, token, req);

        logger.info(`User logged in successfully: ${user.username}`, { 
            userId: user.id,
            sessionId
        });

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role
            },
            token,
            sessionId
        });

    } catch (error) {
        logger.error('Login error:', error);
        next(error);
    }
});

// POST /api/auth/logout - User logout
router.post('/logout', async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                
                // Invalidate all sessions for this user
                await query(
                    'DELETE FROM user_sessions WHERE user_id = $1',
                    [decoded.id]
                );
                
                logger.info(`User logged out: ${decoded.username}`, { 
                    userId: decoded.id 
                });
            } catch (jwtError) {
                // Token might be invalid, but we'll still return success
                logger.warn('Invalid token during logout:', jwtError.message);
            }
        }

        res.json({ message: 'Logout successful' });

    } catch (error) {
        logger.error('Logout error:', error);
        next(error);
    }
});

// GET /api/auth/me - Get current user info
router.get('/me', async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Access token required' });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Get current user info
        const result = await query(
            `SELECT id, username, email, first_name, last_name, role, is_active, 
                    last_login, created_at
             FROM users 
             WHERE id = $1 AND is_active = true`,
            [decoded.id]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'User not found or inactive' });
        }

        const user = result.rows[0];

        res.json({
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role,
                lastLogin: user.last_login,
                createdAt: user.created_at
            }
        });

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        
        logger.error('Get user info error:', error);
        next(error);
    }
});

// POST /api/auth/refresh - Refresh JWT token
router.post('/refresh', async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Access token required' });
        }

        const token = authHeader.substring(7);
        
        // Verify token (allow expired tokens for refresh)
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
            } else {
                return res.status(401).json({ error: 'Invalid token' });
            }
        }

        // Get fresh user data
        const result = await query(
            `SELECT id, username, email, first_name, last_name, role, is_active
             FROM users 
             WHERE id = $1`,
            [decoded.id]
        );

        if (result.rows.length === 0 || !result.rows[0].is_active) {
            return res.status(401).json({ error: 'User not found or inactive' });
        }

        const user = result.rows[0];

        // Generate new token
        const newToken = generateToken(user);
        
        // Create new session
        const sessionId = await createUserSession(user.id, newToken, req);

        logger.info(`Token refreshed for user: ${user.username}`, { 
            userId: user.id,
            sessionId
        });

        res.json({
            message: 'Token refreshed successfully',
            token: newToken,
            sessionId,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role
            }
        });

    } catch (error) {
        logger.error('Token refresh error:', error);
        next(error);
    }
});

module.exports = router;
