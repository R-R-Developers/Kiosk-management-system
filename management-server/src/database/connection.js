require('dotenv').config();
const { Pool } = require('pg');
const logger = require('../utils/logger');

let pool = null;

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'kiosk_management',
    user: process.env.DB_USER || 'kiosk_admin',
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

async function initDatabase() {
    try {
        pool = new Pool(dbConfig);
        
        // Test connection
        const client = await pool.connect();
        await client.query('SELECT NOW()');
        client.release();
        
        logger.info('Database connection established successfully');
        
        // Create tables if they don't exist
        // await createTables(); // Disabled - using migrations instead
        logger.info('Database tables managed by migrations');
        
        return pool;
    } catch (error) {
        logger.error('Failed to initialize database:', error);
        throw error;
    }
}

async function createTables() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user')),
                is_active BOOLEAN DEFAULT true,
                last_login TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        // Device groups table
        await client.query(`
            CREATE TABLE IF NOT EXISTS device_groups (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(100) NOT NULL,
                description TEXT,
                created_by UUID REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        // Devices table
        await client.query(`
            CREATE TABLE IF NOT EXISTS devices (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                device_id VARCHAR(100) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                group_id UUID REFERENCES device_groups(id),
                hardware_info JSONB,
                system_info JSONB,
                network_info JSONB,
                location JSONB,
                status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'error', 'updating')),
                last_seen TIMESTAMP,
                last_heartbeat TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        // Applications table
        await client.query(`
            CREATE TABLE IF NOT EXISTS applications (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(100) NOT NULL,
                version VARCHAR(20) NOT NULL,
                description TEXT,
                package_url VARCHAR(500),
                package_size BIGINT,
                package_hash VARCHAR(64),
                config_schema JSONB,
                supported_architectures TEXT[] DEFAULT ARRAY['x86_64', 'arm64'],
                is_active BOOLEAN DEFAULT true,
                created_by UUID REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(name, version)
            )
        `);
        
        // Device applications (deployed apps on devices)
        await client.query(`
            CREATE TABLE IF NOT EXISTS device_applications (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
                application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
                config JSONB,
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'installing', 'running', 'stopped', 'error', 'uninstalling')),
                installed_at TIMESTAMP,
                last_updated TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(device_id, application_id)
            )
        `);
        
        // Device configurations
        await client.query(`
            CREATE TABLE IF NOT EXISTS device_configurations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
                config_type VARCHAR(50) NOT NULL,
                config_data JSONB NOT NULL,
                is_active BOOLEAN DEFAULT true,
                applied_at TIMESTAMP,
                created_by UUID REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        // Device logs
        await client.query(`
            CREATE TABLE IF NOT EXISTS device_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
                level VARCHAR(10) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
                message TEXT NOT NULL,
                metadata JSONB,
                timestamp TIMESTAMP DEFAULT NOW()
            )
        `);
        
        // System events
        await client.query(`
            CREATE TABLE IF NOT EXISTS system_events (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                event_type VARCHAR(50) NOT NULL,
                entity_type VARCHAR(50),
                entity_id UUID,
                user_id UUID REFERENCES users(id),
                data JSONB,
                timestamp TIMESTAMP DEFAULT NOW()
            )
        `);
        
        // Create indexes
        await client.query('CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_device_logs_device_id ON device_logs(device_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_device_logs_timestamp ON device_logs(timestamp)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_system_events_timestamp ON system_events(timestamp)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_system_events_entity ON system_events(entity_type, entity_id)');
        
        await client.query('COMMIT');
        logger.info('Database tables created/verified successfully');
        
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Failed to create database tables:', error);
        throw error;
    } finally {
        client.release();
    }
}

function getPool() {
    if (!pool) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return pool;
}

async function query(text, params) {
    const client = await pool.connect();
    try {
        const result = await client.query(text, params);
        return result;
    } catch (error) {
        logger.error('Database query error:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function transaction(callback) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    initDatabase,
    getPool,
    query,
    transaction
};
