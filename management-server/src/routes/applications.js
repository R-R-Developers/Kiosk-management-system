const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const db = require('../database/connection');
const logger = require('../utils/logger');

// GET /api/applications - Get all applications
router.get('/', auth, async (req, res, next) => {
    try {
        logger.info('Fetching applications');
        
        const query = `
            SELECT id, name, version, description, package_url, status, created_at, updated_at
            FROM applications
            ORDER BY created_at DESC
        `;
        
        const result = await db.query(query);
        
        res.json({
            success: true,
            applications: result.rows
        });
    } catch (error) {
        logger.error('Error fetching applications:', error);
        next(error);
    }
});

// GET /api/applications/:id - Get single application
router.get('/:id', auth, async (req, res, next) => {
    try {
        const { id } = req.params;
        logger.info('Fetching application with id:', id);
        
        const query = `
            SELECT id, name, version, description, package_url, status, created_at, updated_at
            FROM applications
            WHERE id = $1
        `;
        
        const result = await db.query(query, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }
        
        res.json({
            success: true,
            application: result.rows[0]
        });
    } catch (error) {
        logger.error('Error fetching application:', error);
        next(error);
    }
});

// POST /api/applications - Create new application
router.post('/', auth, async (req, res, next) => {
    try {
        const { name, version, description, package_url, status = 'inactive' } = req.body;
        logger.info('Creating new application:', { name, version });
        
        if (!name || !version || !description) {
            return res.status(400).json({
                success: false,
                message: 'Name, version, and description are required'
            });
        }
        
        const query = `
            INSERT INTO applications (name, version, description, package_url, status)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, name, version, description, package_url, status, created_at, updated_at
        `;
        
        const result = await db.query(query, [name, version, description, package_url, status]);
        
        res.status(201).json({
            success: true,
            application: result.rows[0]
        });
    } catch (error) {
        logger.error('Error creating application:', error);
        next(error);
    }
});

// PUT /api/applications/:id - Update application
router.put('/:id', auth, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, version, description, package_url, status } = req.body;
        logger.info('Updating application with id:', id);
        
        // Check if application exists
        const checkQuery = 'SELECT id FROM applications WHERE id = $1';
        const checkResult = await db.query(checkQuery, [id]);
        
        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }
        
        const query = `
            UPDATE applications 
            SET name = COALESCE($2, name),
                version = COALESCE($3, version),
                description = COALESCE($4, description),
                package_url = COALESCE($5, package_url),
                status = COALESCE($6, status),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING id, name, version, description, package_url, status, created_at, updated_at
        `;
        
        const result = await db.query(query, [id, name, version, description, package_url, status]);
        
        res.json({
            success: true,
            application: result.rows[0]
        });
    } catch (error) {
        logger.error('Error updating application:', error);
        next(error);
    }
});

// DELETE /api/applications/:id - Delete application
router.delete('/:id', auth, async (req, res, next) => {
    try {
        const { id } = req.params;
        logger.info('Deleting application with id:', id);
        
        // Check if application exists
        const checkQuery = 'SELECT id FROM applications WHERE id = $1';
        const checkResult = await db.query(checkQuery, [id]);
        
        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }
        
        const query = 'DELETE FROM applications WHERE id = $1';
        await db.query(query, [id]);
        
        res.json({
            success: true,
            message: 'Application deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting application:', error);
        next(error);
    }
});

module.exports = router;
