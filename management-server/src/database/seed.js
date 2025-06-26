require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, initDatabase } = require('./connection');
const logger = require('../utils/logger');

async function createSampleData() {
    try {
        await initDatabase();
        logger.info('Starting database seeding...');

        // Create admin user if it doesn't exist
        const adminExists = await query(
            'SELECT id FROM users WHERE username = $1',
            ['admin']
        );

        let adminId;
        if (adminExists.rows.length === 0) {
            const passwordHash = await bcrypt.hash('AdminPass123', 12);
            const adminResult = await query(
                `INSERT INTO users (username, email, password_hash, first_name, last_name, role, is_active)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING id`,
                ['admin', 'admin@kiosk.local', passwordHash, 'System', 'Administrator', 'admin', true]
            );
            adminId = adminResult.rows[0].id;
            logger.info('Created admin user');
        } else {
            adminId = adminExists.rows[0].id;
            logger.info('Admin user already exists');
        }

        // Create sample device groups
        const groups = [
            { name: 'Retail Stores', description: 'Kiosks in retail locations' },
            { name: 'Corporate Lobbies', description: 'Information kiosks in office buildings' },
            { name: 'Healthcare', description: 'Patient check-in and information systems' }
        ];

        const groupIds = [];
        for (const group of groups) {
            const existingGroup = await query(
                'SELECT id FROM device_groups WHERE name = $1',
                [group.name]
            );

            if (existingGroup.rows.length === 0) {
                const result = await query(
                    `INSERT INTO device_groups (name, description, created_by)
                     VALUES ($1, $2, $3)
                     RETURNING id`,
                    [group.name, group.description, adminId]
                );
                groupIds.push(result.rows[0].id);
                logger.info(`Created device group: ${group.name}`);
            } else {
                groupIds.push(existingGroup.rows[0].id);
            }
        }

        // Create sample devices
        const devices = [
            {
                device_id: 'KIOSK-001',
                name: 'Main Lobby Kiosk',
                description: 'Primary information kiosk in main lobby',
                device_type: 'kiosk',
                group_id: groupIds[1],
                location: { building: 'HQ', floor: 1, room: 'Lobby' },
                status: 'online'
            },
            {
                device_id: 'KIOSK-002',
                name: 'Store Checkout Terminal',
                description: 'Self-service checkout terminal',
                device_type: 'kiosk',
                group_id: groupIds[0],
                location: { store: 'Downtown', section: 'Checkout' },
                status: 'online'
            },
            {
                device_id: 'TABLET-001',
                name: 'Patient Check-in Tablet',
                description: 'Tablet for patient registration',
                device_type: 'tablet',
                group_id: groupIds[2],
                location: { clinic: 'Main', area: 'Reception' },
                status: 'offline'
            },
            {
                device_id: 'DISPLAY-001',
                name: 'Digital Signage Display',
                description: 'Marketing content display',
                device_type: 'display',
                group_id: groupIds[0],
                location: { store: 'Mall Location', zone: 'Entrance' },
                status: 'maintenance'
            }
        ];

        for (const device of devices) {
            const existing = await query(
                'SELECT id FROM devices WHERE device_id = $1',
                [device.device_id]
            );

            if (existing.rows.length === 0) {
                const result = await query(
                    `INSERT INTO devices (device_id, name, description, device_type, group_id, location, status, created_by)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                     RETURNING id`,
                    [
                        device.device_id,
                        device.name,
                        device.description,
                        device.device_type,
                        device.group_id,
                        JSON.stringify(device.location),
                        device.status,
                        adminId
                    ]
                );
                
                // Add some sample logs for each device
                const deviceId = result.rows[0].id;
                const logs = [
                    { level: 'info', message: 'Device started successfully', category: 'system' },
                    { level: 'info', message: 'Network connection established', category: 'network' },
                    { level: 'warn', message: 'Low disk space warning', category: 'system' }
                ];

                for (const log of logs) {
                    await query(
                        `INSERT INTO device_logs (device_id, level, message, category)
                         VALUES ($1, $2, $3, $4)`,
                        [deviceId, log.level, log.message, log.category]
                    );
                }

                logger.info(`Created device: ${device.device_id}`);
            }
        }

        // Create sample applications
        const applications = [
            {
                name: 'Kiosk Browser',
                package_name: 'com.kiosk.browser',
                version: '2.1.0',
                description: 'Secure web browser for kiosk applications',
                category: 'system',
                is_system_app: true
            },
            {
                name: 'Digital Signage Player',
                package_name: 'com.signage.player',
                version: '1.5.2',
                description: 'Media player for digital signage content',
                category: 'media'
            },
            {
                name: 'Customer Survey App',
                package_name: 'com.survey.customer',
                version: '3.0.1',
                description: 'Customer feedback and survey application',
                category: 'business'
            }
        ];

        for (const app of applications) {
            const existing = await query(
                'SELECT id FROM applications WHERE package_name = $1',
                [app.package_name]
            );

            if (existing.rows.length === 0) {
                await query(
                    `INSERT INTO applications (name, package_name, version, description, category, is_system_app, created_by)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        app.name,
                        app.package_name,
                        app.version,
                        app.description,
                        app.category,
                        app.is_system_app || false,
                        adminId
                    ]
                );
                logger.info(`Created application: ${app.name}`);
            }
        }

        // Create sample configuration profile
        const configExists = await query(
            'SELECT id FROM config_profiles WHERE name = $1',
            ['Default Kiosk Config']
        );

        if (configExists.rows.length === 0) {
            const defaultConfig = {
                display: {
                    brightness: 80,
                    timeout: 300,
                    orientation: 'landscape'
                },
                network: {
                    wifi_enabled: true,
                    ethernet_enabled: true
                },
                security: {
                    auto_lock: true,
                    lock_timeout: 600,
                    require_password: false
                },
                applications: {
                    auto_update: true,
                    allowed_apps: ['com.kiosk.browser', 'com.signage.player']
                }
            };

            await query(
                `INSERT INTO config_profiles (name, description, config_data, is_default, created_by)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    'Default Kiosk Config',
                    'Standard configuration for new kiosk devices',
                    JSON.stringify(defaultConfig),
                    true,
                    adminId
                ]
            );
            logger.info('Created default configuration profile');
        }

        logger.info('Database seeding completed successfully!');
        logger.info('Sample data includes:');
        logger.info('- Admin user: admin / AdminPass123');
        logger.info('- 3 device groups');
        logger.info('- 4 sample devices');
        logger.info('- 3 sample applications');
        logger.info('- Default configuration profile');

    } catch (error) {
        logger.error('Error seeding database:', error);
        throw error;
    }
}

module.exports = { createSampleData };

// CLI usage
if (require.main === module) {
    createSampleData()
        .then(() => {
            logger.info('Seeding completed');
            process.exit(0);
        })
        .catch(error => {
            logger.error('Seeding failed:', error);
            process.exit(1);
        });
}
