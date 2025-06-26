const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../database/connection');
const logger = require('../utils/logger');

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: { error: 'Too many authentication attempts, please try again later.' }
});

// Validation middleware
const validateLogin = [
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

const validateRegister = [
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').optional().isIn(['admin', 'manager', 'user']).withMessage('Invalid role')
];

// Generate JWT token
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

// Login endpoint
router.post('/login', authLimiter, validateLogin, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const { username, password } = req.body;

        // Find user
        const userResult = await query(
            'SELECT id, username, email, password_hash, role, is_active FROM users WHERE username = $1 OR email = $1',
            [username]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = userResult.rows[0];

        if (!user.is_active) {
            return res.status(401).json({ error: 'Account is disabled' });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last login
        await query(
            'UPDATE users SET last_login = NOW() WHERE id = $1',
            [user.id]
        );

        // Generate token
        const token = generateToken(user);

        // Log login event
        await query(
            'INSERT INTO system_events (event_type, entity_type, entity_id, user_id, data) VALUES ($1, $2, $3, $4, $5)',
            ['user_login', 'user', user.id, user.id, { ip: req.ip, user_agent: req.get('User-Agent') }]
        );

        logger.info(`User ${user.username} logged in successfully`);

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Register endpoint (admin only in production)
router.post('/register', validateRegister, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const { username, email, password, role = 'user' } = req.body;

        // In production, only allow registration by admin users
        if (process.env.NODE_ENV === 'production') {
            // This would need proper auth middleware
            return res.status(403).json({ error: 'Registration disabled in production' });
        }

        // Check if user already exists
        const existingUser = await query(
            'SELECT id FROM users WHERE username = $1 OR email = $2',
            [username, email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({ error: 'Username or email already exists' });
        }

        // Hash password
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Create user
        const result = await query(
            'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, created_at',
            [username, email, passwordHash, role]
        );

        const newUser = result.rows[0];

        // Log registration event
        await query(
            'INSERT INTO system_events (event_type, entity_type, entity_id, data) VALUES ($1, $2, $3, $4)',
            ['user_register', 'user', newUser.id, { ip: req.ip, user_agent: req.get('User-Agent') }]
        );

        logger.info(`New user registered: ${newUser.username}`);

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                role: newUser.role,
                created_at: newUser.created_at
            }
        });

    } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Token verification endpoint
router.get('/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Verify user still exists and is active
        const userResult = await query(
            'SELECT id, username, email, role, is_active FROM users WHERE id = $1',
            [decoded.id]
        );

        if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        res.json({
            valid: true,
            user: userResult.rows[0]
        });

    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        
        logger.error('Token verification error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Logout endpoint (optional - mainly for logging)
router.post('/logout', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Log logout event
            await query(
                'INSERT INTO system_events (event_type, entity_type, entity_id, user_id, data) VALUES ($1, $2, $3, $4, $5)',
                ['user_logout', 'user', decoded.id, decoded.id, { ip: req.ip }]
            );
        }

        res.json({ message: 'Logout successful' });

    } catch (error) {
        // Even if token verification fails, we still respond with success
        res.json({ message: 'Logout successful' });
    }
});

module.exports = router;
