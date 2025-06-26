const express = require('express');
const { body, validationResult, query: queryValidator } = require('express-validator');
const { query, transaction } = require('../database/connection');
const { auth, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');
const { getRedisClient } = require('../services/redis');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Apply authentication to all device routes
router.use(auth);

// Validation middleware
const validateDevice = [
    body('device_id').trim().isLength({ min: 1 }).withMessage('Device ID is required'),
    body('name').trim().isLength({ min: 1 }).withMessage('Device name is required'),
    body('description').optional().trim(),
    body('device_type').optional().isIn(['kiosk', 'tablet', 'display', 'signage']).withMessage('Invalid device type'),
    body('group_id').optional().isUUID().withMessage('Invalid group ID'),
    body('location').optional().isObject().withMessage('Location must be an object')
];

const validateDeviceUpdate = [
    body('name').optional().trim().isLength({ min: 1 }).withMessage('Device name cannot be empty'),
    body('description').optional().trim(),
    body('device_type').optional().isIn(['kiosk', 'tablet', 'display', 'signage']).withMessage('Invalid device type'),
    body('group_id').optional().isUUID().withMessage('Invalid group ID'),
    body('location').optional().isObject().withMessage('Location must be an object'),
    body('status').optional().isIn(['online', 'offline', 'maintenance', 'error']).withMessage('Invalid status')
];

// GET /api/devices - Get all devices with filtering and pagination
router.get('/', [
    queryValidator('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    queryValidator('status').optional().isIn(['online', 'offline', 'maintenance', 'error']).withMessage('Invalid status filter'),
    queryValidator('group_id').optional().isUUID().withMessage('Invalid group ID'),
    queryValidator('search').optional().trim()
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '20');
        const offset = (page - 1) * limit;
        const { status, group_id, search } = req.query;

        // Build dynamic query
        let whereConditions = ['1=1'];
        let queryParams = [];
        let paramIndex = 1;

        if (status) {
            whereConditions.push(`d.status = $${paramIndex}`);
            queryParams.push(status);
            paramIndex++;
        }

        if (group_id) {
            whereConditions.push(`d.group_id = $${paramIndex}`);
            queryParams.push(group_id);
            paramIndex++;
        }

        if (search) {
            whereConditions.push(`(d.name ILIKE $${paramIndex} OR d.device_id ILIKE $${paramIndex} OR d.description ILIKE $${paramIndex})`);
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        const whereClause = whereConditions.join(' AND ');

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total
            FROM devices d
            LEFT JOIN device_groups dg ON d.group_id = dg.id
            WHERE ${whereClause}
        `;
        const countResult = await query(countQuery, queryParams);
        const total = parseInt(countResult.rows[0].total);

        // Get devices
        const devicesQuery = `
            SELECT 
                d.id, d.device_id, d.name, d.description, d.device_type, d.status,
                d.location, d.hardware_info, d.software_info, d.network_info,
                d.last_seen, d.last_heartbeat, d.created_at, d.updated_at,
                dg.name as group_name, dg.id as group_id,
                u.username as created_by_username
            FROM devices d
            LEFT JOIN device_groups dg ON d.group_id = dg.id
            LEFT JOIN users u ON d.created_by = u.id
            WHERE ${whereClause}
            ORDER BY d.last_seen DESC NULLS LAST, d.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        queryParams.push(limit, offset);
        
        const devicesResult = await query(devicesQuery, queryParams);

        // Calculate pagination info
        const totalPages = Math.ceil(total / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        logger.info(`Retrieved devices: page ${page}, total: ${total}`, { 
            userId: req.user.id,
            filters: { status, group_id, search }
        });

        res.json({
            devices: devicesResult.rows,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems: total,
                itemsPerPage: limit,
                hasNextPage,
                hasPreviousPage
            }
        });

    } catch (error) {
        logger.error('Error retrieving devices:', error);
        next(error);
    }
});

// GET /api/devices/:id - Get single device
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await query(
            `SELECT 
                d.*, 
                dg.name as group_name,
                u.username as created_by_username
             FROM devices d
             LEFT JOIN device_groups dg ON d.group_id = dg.id
             LEFT JOIN users u ON d.created_by = u.id
             WHERE d.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        const device = result.rows[0];

        // Get recent logs for this device
        const logsResult = await query(
            `SELECT level, message, category, metadata, timestamp
             FROM device_logs 
             WHERE device_id = $1 
             ORDER BY timestamp DESC 
             LIMIT 10`,
            [id]
        );

        // Get installed applications
        const appsResult = await query(
            `SELECT 
                a.id, a.name, a.package_name, a.version as app_version,
                da.version as installed_version, da.status, da.installed_at
             FROM device_applications da
             JOIN applications a ON da.application_id = a.id
             WHERE da.device_id = $1
             ORDER BY da.installed_at DESC`,
            [id]
        );

        logger.info(`Retrieved device details: ${device.device_id}`, { 
            userId: req.user.id,
            deviceId: id
        });

        res.json({
            device,
            recentLogs: logsResult.rows,
            installedApplications: appsResult.rows
        });

    } catch (error) {
        logger.error('Error retrieving device:', error);
        next(error);
    }
});

// POST /api/devices - Create new device
router.post('/', validateDevice, async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { device_id, name, description, device_type, group_id, location } = req.body;

        // Check if device_id already exists
        const existing = await query(
            'SELECT id FROM devices WHERE device_id = $1',
            [device_id]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Device ID already exists' });
        }

        // Create device
        const result = await query(
            `INSERT INTO devices (device_id, name, description, device_type, group_id, location, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [device_id, name, description || null, device_type || 'kiosk', group_id || null, location || null, req.user.id]
        );

        const device = result.rows[0];

        // Log device creation
        await query(
            `INSERT INTO device_logs (device_id, level, message, category, metadata)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                device.id,
                'info',
                'Device registered',
                'system',
                JSON.stringify({ created_by: req.user.username })
            ]
        );

        logger.info(`Device created: ${device_id}`, { 
            userId: req.user.id,
            deviceId: device.id
        });

        res.status(201).json({
            message: 'Device created successfully',
            device
        });

    } catch (error) {
        logger.error('Error creating device:', error);
        next(error);
    }
});

// PUT /api/devices/:id - Update device
router.put('/:id', validateDeviceUpdate, async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { id } = req.params;
        const { name, description, device_type, group_id, location, status } = req.body;

        // Check if device exists
        const existing = await query('SELECT * FROM devices WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Build update query dynamically
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (name !== undefined) {
            updates.push(`name = $${paramIndex}`);
            values.push(name);
            paramIndex++;
        }
        if (description !== undefined) {
            updates.push(`description = $${paramIndex}`);
            values.push(description);
            paramIndex++;
        }
        if (device_type !== undefined) {
            updates.push(`device_type = $${paramIndex}`);
            values.push(device_type);
            paramIndex++;
        }
        if (group_id !== undefined) {
            updates.push(`group_id = $${paramIndex}`);
            values.push(group_id);
            paramIndex++;
        }
        if (location !== undefined) {
            updates.push(`location = $${paramIndex}`);
            values.push(JSON.stringify(location));
            paramIndex++;
        }
        if (status !== undefined) {
            updates.push(`status = $${paramIndex}`);
            values.push(status);
            paramIndex++;
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        // Add updated_at and where clause
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id);

        const updateQuery = `
            UPDATE devices 
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `;

        const result = await query(updateQuery, values);
        const device = result.rows[0];

        // Log device update
        await query(
            `INSERT INTO device_logs (device_id, level, message, category, metadata)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                device.id,
                'info',
                'Device updated',
                'system',
                JSON.stringify({ 
                    updated_by: req.user.username,
                    updated_fields: Object.keys(req.body)
                })
            ]
        );

        logger.info(`Device updated: ${device.device_id}`, { 
            userId: req.user.id,
            deviceId: id,
            updatedFields: Object.keys(req.body)
        });

        res.json({
            message: 'Device updated successfully',
            device
        });

    } catch (error) {
        logger.error('Error updating device:', error);
        next(error);
    }
});

// DELETE /api/devices/:id - Delete device (admin only)
router.delete('/:id', authorize(['admin']), async (req, res, next) => {
    try {
        const { id } = req.params;

        // Check if device exists
        const existing = await query('SELECT * FROM devices WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        const device = existing.rows[0];

        // Delete device (cascade will handle related records)
        await query('DELETE FROM devices WHERE id = $1', [id]);

        logger.info(`Device deleted: ${device.device_id}`, { 
            userId: req.user.id,
            deviceId: id
        });

        res.json({
            message: 'Device deleted successfully'
        });

    } catch (error) {
        logger.error('Error deleting device:', error);
        next(error);
    }
});

// POST /api/devices/:id/heartbeat - Device heartbeat endpoint
router.post('/:id/heartbeat', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { hardware_info, software_info, network_info, logs } = req.body;

        // Update device heartbeat and info
        const result = await query(
            `UPDATE devices 
             SET last_heartbeat = CURRENT_TIMESTAMP,
                 last_seen = CURRENT_TIMESTAMP,
                 status = CASE WHEN status = 'offline' THEN 'online' ELSE status END,
                 hardware_info = COALESCE($2, hardware_info),
                 software_info = COALESCE($3, software_info),
                 network_info = COALESCE($4, network_info)
             WHERE id = $1
             RETURNING device_id, status`,
            [id, hardware_info ? JSON.stringify(hardware_info) : null, 
             software_info ? JSON.stringify(software_info) : null,
             network_info ? JSON.stringify(network_info) : null]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        const device = result.rows[0];

        // Process any logs sent with heartbeat
        if (logs && Array.isArray(logs)) {
            for (const log of logs.slice(0, 50)) { // Limit to 50 logs per heartbeat
                if (log.message && log.level) {
                    await query(
                        `INSERT INTO device_logs (device_id, level, message, category, metadata, timestamp)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [
                            id,
                            log.level || 'info',
                            log.message,
                            log.category || 'device',
                            log.metadata ? JSON.stringify(log.metadata) : null,
                            log.timestamp ? new Date(log.timestamp) : new Date()
                        ]
                    );
                }
            }
        }

        // Cache device status in Redis for quick access
        const redis = getRedisClient();
        if (redis) {
            await redis.setex(`device:${id}:status`, 300, JSON.stringify({
                status: device.status,
                last_seen: new Date().toISOString()
            }));
        }

        res.json({
            message: 'Heartbeat received',
            device_id: device.device_id,
            status: device.status
        });

    } catch (error) {
        logger.error('Error processing device heartbeat:', error);
        next(error);
    }
});

// GET /api/devices/:id/logs - Get device logs
router.get('/:id/logs', [
    queryValidator('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    queryValidator('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
    queryValidator('level').optional().isIn(['debug', 'info', 'warn', 'error', 'fatal']).withMessage('Invalid log level'),
    queryValidator('category').optional().trim()
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { id } = req.params;
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '100');
        const offset = (page - 1) * limit;
        const { level, category } = req.query;

        // Build query conditions
        let whereConditions = ['device_id = $1'];
        let queryParams = [id];
        let paramIndex = 2;

        if (level) {
            whereConditions.push(`level = $${paramIndex}`);
            queryParams.push(level);
            paramIndex++;
        }

        if (category) {
            whereConditions.push(`category = $${paramIndex}`);
            queryParams.push(category);
            paramIndex++;
        }

        const whereClause = whereConditions.join(' AND ');

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) as total FROM device_logs WHERE ${whereClause}`,
            queryParams
        );
        const total = parseInt(countResult.rows[0].total);

        // Get logs
        const logsQuery = `
            SELECT level, message, category, metadata, timestamp
            FROM device_logs 
            WHERE ${whereClause}
            ORDER BY timestamp DESC 
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        queryParams.push(limit, offset);

        const logsResult = await query(logsQuery, queryParams);

        res.json({
            logs: logsResult.rows,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: limit
            }
        });

    } catch (error) {
        logger.error('Error retrieving device logs:', error);
        next(error);
    }
});

module.exports = router;

// Get all devices with filtering and pagination
router.get('/', async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            status, 
            group_id, 
            search,
            sort_by = 'name',
            sort_order = 'ASC'
        } = req.query;

        const offset = (page - 1) * limit;
        const validSortFields = ['name', 'status', 'last_seen', 'created_at'];
        const validSortOrder = ['ASC', 'DESC'];

        if (!validSortFields.includes(sort_by) || !validSortOrder.includes(sort_order.toUpperCase())) {
            return res.status(400).json({ error: 'Invalid sort parameters' });
        }

        let queryText = `
            SELECT 
                d.*,
                dg.name as group_name,
                COUNT(*) OVER() as total_count
            FROM devices d
            LEFT JOIN device_groups dg ON d.group_id = dg.id
            WHERE 1=1
        `;
        
        const queryParams = [];
        let paramCount = 0;

        if (status) {
            paramCount++;
            queryText += ` AND d.status = $${paramCount}`;
            queryParams.push(status);
        }

        if (group_id) {
            paramCount++;
            queryText += ` AND d.group_id = $${paramCount}`;
            queryParams.push(group_id);
        }

        if (search) {
            paramCount++;
            queryText += ` AND (d.name ILIKE $${paramCount} OR d.device_id ILIKE $${paramCount} OR d.description ILIKE $${paramCount})`;
            queryParams.push(`%${search}%`);
        }

        queryText += ` ORDER BY d.${sort_by} ${sort_order.toUpperCase()}`;
        
        paramCount++;
        queryText += ` LIMIT $${paramCount}`;
        queryParams.push(limit);
        
        paramCount++;
        queryText += ` OFFSET $${paramCount}`;
        queryParams.push(offset);

        const result = await query(queryText, queryParams);
        
        const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
        const devices = result.rows.map(row => {
            const { total_count, ...device } = row;
            return device;
        });

        res.json({
            devices,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalCount,
                pages: Math.ceil(totalCount / limit)
            }
        });

    } catch (error) {
        logger.error('Get devices error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get device by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(`
            SELECT 
                d.*,
                dg.name as group_name,
                COALESCE(
                    JSON_AGG(
                        JSON_BUILD_OBJECT(
                            'id', da.id,
                            'application_id', da.application_id,
                            'application_name', a.name,
                            'application_version', a.version,
                            'status', da.status,
                            'config', da.config,
                            'installed_at', da.installed_at
                        )
                    ) FILTER (WHERE da.id IS NOT NULL), 
                    '[]'::json
                ) as applications
            FROM devices d
            LEFT JOIN device_groups dg ON d.group_id = dg.id
            LEFT JOIN device_applications da ON d.id = da.device_id
            LEFT JOIN applications a ON da.application_id = a.id
            WHERE d.id = $1
            GROUP BY d.id, dg.name
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        logger.error('Get device error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create new device
router.post('/', validateDevice, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const { device_id, name, description, group_id, location } = req.body;

        // Check if device_id already exists
        const existingDevice = await query('SELECT id FROM devices WHERE device_id = $1', [device_id]);
        if (existingDevice.rows.length > 0) {
            return res.status(409).json({ error: 'Device ID already exists' });
        }

        const result = await query(`
            INSERT INTO devices (device_id, name, description, group_id, location)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [device_id, name, description, group_id || null, location || null]);

        const newDevice = result.rows[0];

        // Log device creation
        await query(
            'INSERT INTO system_events (event_type, entity_type, entity_id, user_id, data) VALUES ($1, $2, $3, $4, $5)',
            ['device_created', 'device', newDevice.id, req.user.id, { device_id, name }]
        );

        logger.info(`Device created: ${name} (${device_id}) by user ${req.user.username}`);

        res.status(201).json(newDevice);

    } catch (error) {
        logger.error('Create device error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update device
router.put('/:id', validateDevice, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const { id } = req.params;
        const { device_id, name, description, group_id, location } = req.body;

        // Check if device exists
        const existingDevice = await query('SELECT * FROM devices WHERE id = $1', [id]);
        if (existingDevice.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Check if new device_id conflicts with another device
        if (device_id !== existingDevice.rows[0].device_id) {
            const conflictDevice = await query('SELECT id FROM devices WHERE device_id = $1 AND id != $2', [device_id, id]);
            if (conflictDevice.rows.length > 0) {
                return res.status(409).json({ error: 'Device ID already exists' });
            }
        }

        const result = await query(`
            UPDATE devices 
            SET device_id = $1, name = $2, description = $3, group_id = $4, location = $5, updated_at = NOW()
            WHERE id = $6
            RETURNING *
        `, [device_id, name, description, group_id || null, location || null, id]);

        const updatedDevice = result.rows[0];

        // Log device update
        await query(
            'INSERT INTO system_events (event_type, entity_type, entity_id, user_id, data) VALUES ($1, $2, $3, $4, $5)',
            ['device_updated', 'device', id, req.user.id, { changes: req.body }]
        );

        logger.info(`Device updated: ${name} (${device_id}) by user ${req.user.username}`);

        res.json(updatedDevice);

    } catch (error) {
        logger.error('Update device error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete device
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await transaction(async (client) => {
            // Get device info before deletion
            const deviceResult = await client.query('SELECT * FROM devices WHERE id = $1', [id]);
            if (deviceResult.rows.length === 0) {
                throw new Error('Device not found');
            }
            const device = deviceResult.rows[0];

            // Delete device (cascades to device_applications, device_configurations, device_logs)
            await client.query('DELETE FROM devices WHERE id = $1', [id]);

            // Log device deletion
            await client.query(
                'INSERT INTO system_events (event_type, entity_type, entity_id, user_id, data) VALUES ($1, $2, $3, $4, $5)',
                ['device_deleted', 'device', id, req.user.id, { device_id: device.device_id, name: device.name }]
            );

            return device;
        });

        logger.info(`Device deleted: ${result.name} (${result.device_id}) by user ${req.user.username}`);

        res.json({ message: 'Device deleted successfully' });

    } catch (error) {
        if (error.message === 'Device not found') {
            return res.status(404).json({ error: 'Device not found' });
        }
        
        logger.error('Delete device error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Device heartbeat endpoint (used by kiosk OS)
router.post('/:device_id/heartbeat', async (req, res) => {
    try {
        const { device_id } = req.params;
        const { hardware_info, system_info, network_info, status = 'online' } = req.body;

        // Update device status and info
        const result = await query(`
            UPDATE devices 
            SET 
                status = $1,
                hardware_info = COALESCE($2, hardware_info),
                system_info = COALESCE($3, system_info),
                network_info = COALESCE($4, network_info),
                last_seen = NOW(),
                last_heartbeat = NOW(),
                updated_at = NOW()
            WHERE device_id = $5
            RETURNING *
        `, [status, hardware_info, system_info, network_info, device_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        const device = result.rows[0];

        // Cache device status in Redis for quick access
        const redis = getRedisClient();
        if (redis) {
            await redis.setex(`device:${device_id}:status`, 300, JSON.stringify({
                status: device.status,
                last_seen: device.last_seen,
                last_heartbeat: device.last_heartbeat
            }));
        }

        // Emit real-time update via WebSocket
        req.app.get('io')?.emit('device_status_update', {
            device_id: device.id,
            device_id_string: device.device_id,
            status: device.status,
            last_seen: device.last_seen
        });

        res.json({ message: 'Heartbeat received', device_status: device.status });

    } catch (error) {
        logger.error('Device heartbeat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get device logs
router.get('/:id/logs', async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 50, level, since } = req.query;

        const offset = (page - 1) * limit;
        
        let queryText = `
            SELECT * FROM device_logs 
            WHERE device_id = $1
        `;
        
        const queryParams = [id];
        let paramCount = 1;

        if (level) {
            paramCount++;
            queryText += ` AND level = $${paramCount}`;
            queryParams.push(level);
        }

        if (since) {
            paramCount++;
            queryText += ` AND timestamp >= $${paramCount}`;
            queryParams.push(since);
        }

        queryText += ` ORDER BY timestamp DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
        queryParams.push(limit, offset);

        const result = await query(queryText, queryParams);

        res.json({
            logs: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        logger.error('Get device logs error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
