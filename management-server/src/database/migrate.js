const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { query, initDatabase } = require('./connection');
const logger = require('../utils/logger');

class DatabaseMigrator {
    constructor() {
        this.migrationsPath = path.join(__dirname, 'migrations');
        this.migrationsTable = 'schema_migrations';
    }

    async init() {
        // Create migrations tracking table
        await query(`
            CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(255) NOT NULL UNIQUE,
                executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        logger.info('Migration tracking table initialized');
    }

    async getExecutedMigrations() {
        const result = await query(`SELECT filename FROM ${this.migrationsTable} ORDER BY executed_at`);
        return result.rows.map(row => row.filename);
    }

    async getMigrationFiles() {
        if (!fs.existsSync(this.migrationsPath)) {
            logger.warn('Migrations directory does not exist');
            return [];
        }

        return fs.readdirSync(this.migrationsPath)
            .filter(file => file.endsWith('.sql'))
            .sort();
    }

    async executeMigration(filename) {
        const filePath = path.join(this.migrationsPath, filename);
        const sql = fs.readFileSync(filePath, 'utf8');

        logger.info(`Executing migration: ${filename}`);
        
        try {
            // Execute the migration SQL
            await query(sql);
            
            // Record the migration as executed
            await query(
                `INSERT INTO ${this.migrationsTable} (filename) VALUES ($1)`,
                [filename]
            );
            
            logger.info(`Migration ${filename} executed successfully`);
        } catch (error) {
            logger.error(`Migration ${filename} failed:`, error);
            throw error;
        }
    }

    async runPendingMigrations() {
        // Initialize database connection first
        await initDatabase();
        await this.init();

        const executedMigrations = await this.getExecutedMigrations();
        const migrationFiles = await this.getMigrationFiles();
        
        const pendingMigrations = migrationFiles.filter(
            file => !executedMigrations.includes(file)
        );

        if (pendingMigrations.length === 0) {
            logger.info('No pending migrations');
            return;
        }

        logger.info(`Found ${pendingMigrations.length} pending migrations`);

        for (const migration of pendingMigrations) {
            await this.executeMigration(migration);
        }

        logger.info('All migrations completed successfully');
    }

    async rollbackLastMigration() {
        const executedMigrations = await this.getExecutedMigrations();
        
        if (executedMigrations.length === 0) {
            logger.warn('No migrations to rollback');
            return;
        }

        const lastMigration = executedMigrations[executedMigrations.length - 1];
        
        // Check if rollback file exists
        const rollbackFile = lastMigration.replace('.sql', '.rollback.sql');
        const rollbackPath = path.join(this.migrationsPath, rollbackFile);

        if (!fs.existsSync(rollbackPath)) {
            logger.error(`Rollback file not found: ${rollbackFile}`);
            throw new Error(`No rollback available for migration: ${lastMigration}`);
        }

        const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');

        logger.info(`Rolling back migration: ${lastMigration}`);
        
        try {
            await query(rollbackSql);
            await query(
                `DELETE FROM ${this.migrationsTable} WHERE filename = $1`,
                [lastMigration]
            );
            
            logger.info(`Migration ${lastMigration} rolled back successfully`);
        } catch (error) {
            logger.error(`Rollback failed for ${lastMigration}:`, error);
            throw error;
        }
    }
}

module.exports = DatabaseMigrator;

// CLI usage
if (require.main === module) {
    const migrator = new DatabaseMigrator();
    
    const command = process.argv[2];
    
    switch (command) {
        case 'migrate':
            migrator.runPendingMigrations()
                .then(() => {
                    logger.info('Migration completed');
                    process.exit(0);
                })
                .catch(error => {
                    logger.error('Migration failed:', error);
                    process.exit(1);
                });
            break;
            
        case 'rollback':
            migrator.rollbackLastMigration()
                .then(() => {
                    logger.info('Rollback completed');
                    process.exit(0);
                })
                .catch(error => {
                    logger.error('Rollback failed:', error);
                    process.exit(1);
                });
            break;
            
        default:
            console.log('Usage: node migrate.js [migrate|rollback]');
            process.exit(1);
    }
}
