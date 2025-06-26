const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const db = require('../database/connection');
const logger = require('../utils/logger');

// GET /api/device-groups - Get all device groups
router.get('/', auth, async (req, res, next) => {
    try {
        logger.info('Fetching device groups');
        
        const query = `
            SELECT id, name, description, created_at, updated_at
            FROM device_groups
            ORDER BY name
        `;
        
        const result = await db.query(query);
        
        res.json({
            success: true,
            groups: result.rows
        });
    } catch (error) {
        logger.error('Error fetching device groups:', error);
        next(error);
    }
});

// GET /api/device-groups/:id - Get single device group
router.get('/:id', auth, async (req, res, next) => {
    try {
        const { id } = req.params;
        logger.info('Fetching device group with id:', id);
        
        const query = `
            SELECT id, name, description, created_at, updated_at
            FROM device_groups
            WHERE id = $1
        `;
        
        const result = await db.query(query, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Device group not found'
            });
        }
        
        res.json({
            success: true,
            group: result.rows[0]
        });
    } catch (error) {
        logger.error('Error fetching device group:', error);
        next(error);
    }
});

// POST /api/device-groups - Create new device group
router.post('/', auth, async (req, res, next) => {
    try {
        const { name, description } = req.body;
        logger.info('Creating new device group:', { name });
        
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Name is required'
            });
        }
        
        const query = `
            INSERT INTO device_groups (name, description)
            VALUES ($1, $2)
            RETURNING id, name, description, created_at, updated_at
        `;
        
        const result = await db.query(query, [name, description]);
        
        res.status(201).json({
            success: true,
            group: result.rows[0]
        });
    } catch (error) {
        logger.error('Error creating device group:', error);
        next(error);
    }
});

// PUT /api/device-groups/:id - Update device group
router.put('/:id', auth, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        logger.info('Updating device group with id:', id);
        
        // Check if device group exists
        const checkQuery = 'SELECT id FROM device_groups WHERE id = $1';
        const checkResult = await db.query(checkQuery, [id]);
        
        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Device group not found'
            });
        }
        
        const query = `
            UPDATE device_groups 
            SET name = COALESCE($2, name),
                description = COALESCE($3, description),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING id, name, description, created_at, updated_at
        `;
        
        const result = await db.query(query, [id, name, description]);
        
        res.json({
            success: true,
            group: result.rows[0]
        });
    } catch (error) {
        logger.error('Error updating device group:', error);
        next(error);
    }
});

// DELETE /api/device-groups/:id - Delete device group
router.delete('/:id', auth, async (req, res, next) => {
    try {
        const { id } = req.params;
        logger.info('Deleting device group with id:', id);
        
        // Check if device group exists
        const checkQuery = 'SELECT id FROM device_groups WHERE id = $1';
        const checkResult = await db.query(checkQuery, [id]);
        
        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Device group not found'
            });
        }
        
        // Check if group has devices
        const devicesQuery = 'SELECT COUNT(*) FROM devices WHERE group_id = $1';
        const devicesResult = await db.query(devicesQuery, [id]);
        
        if (parseInt(devicesResult.rows[0].count) > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete device group that contains devices'
            });
        }
        
        const query = 'DELETE FROM device_groups WHERE id = $1';
        await db.query(query, [id]);
        
        res.json({
            success: true,
            message: 'Device group deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting device group:', error);
        next(error);
    }
});

module.exports = router;
