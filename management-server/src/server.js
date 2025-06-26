const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const applicationRoutes = require('./routes/applications');
const deviceGroupRoutes = require('./routes/device-groups');
const userRoutes = require('./routes/users');
const analyticsRoutes = require('./routes/analytics');
const configRoutes = require('./routes/config');

const { initDatabase } = require('./database/connection');
const { initRedis } = require('./services/redis');
const { setupWebSocket } = require('./services/websocket');
const { startCronJobs } = require('./services/cron');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

class KioskManagementServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: process.env.NODE_ENV === 'production' ? false : "*",
                methods: ["GET", "POST"]
            }
        });
        this.port = process.env.PORT || 3001;
        this.host = process.env.HOST || '0.0.0.0';
    }

    async initialize() {
        try {
            // Initialize database
            await initDatabase();
            logger.info('Database initialized successfully');

            // Initialize Redis
            await initRedis();
            logger.info('Redis initialized successfully');

            // Setup middleware
            this.setupMiddleware();

            // Setup routes
            this.setupRoutes();

            // Setup WebSocket
            setupWebSocket(this.io);
            logger.info('WebSocket initialized successfully');

            // Setup error handling
            this.setupErrorHandling();

            // Start cron jobs
            startCronJobs();
            logger.info('Cron jobs started successfully');

        } catch (error) {
            logger.error('Failed to initialize server:', error);
            process.exit(1);
        }
    }

    setupMiddleware() {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                },
            },
        }));

        // Rate limiting
        const limiter = rateLimit({
            windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
            max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
        });
        this.app.use('/api/', limiter);

        // CORS
        this.app.use(cors({
            origin: process.env.NODE_ENV === 'production' ? 
                ['https://your-domain.com'] : 
                ['http://localhost:3000', 'http://localhost:3001'],
            credentials: true
        }));

        // Compression
        this.app.use(compression());

        // Logging
        this.app.use(morgan('combined', {
            stream: { write: (message) => logger.info(message.trim()) }
        }));

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Static files
        this.app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
        
        // Serve React app in production
        if (process.env.NODE_ENV === 'production') {
            this.app.use(express.static(path.join(__dirname, '../client/build')));
        }
    }

    setupRoutes() {
        // API routes
        this.app.use('/api/auth', authRoutes);
        this.app.use('/api/devices', deviceRoutes);
        this.app.use('/api/device-groups', deviceGroupRoutes);
        this.app.use('/api/applications', applicationRoutes);
        this.app.use('/api/users', userRoutes);
        this.app.use('/api/analytics', analyticsRoutes);
        this.app.use('/api/config', configRoutes);

        // Health check
        this.app.get('/api/health', (req, res) => {
            res.json({ 
                status: 'OK', 
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: require('../package.json').version
            });
        });

        // Serve React app for all other routes in production
        if (process.env.NODE_ENV === 'production') {
            this.app.get('*', (req, res) => {
                res.sendFile(path.join(__dirname, '../client/build/index.html'));
            });
        }
    }

    setupErrorHandling() {
        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).json({ error: 'Route not found' });
        });

        // Global error handler
        this.app.use(errorHandler);

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
            this.shutdown();
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', error);
            this.shutdown();
        });

        // Graceful shutdown
        process.on('SIGTERM', () => this.shutdown());
        process.on('SIGINT', () => this.shutdown());
    }

    async start() {
        await this.initialize();
        
        this.server.listen(this.port, this.host, () => {
            logger.info(`Kiosk Management Server running on ${this.host}:${this.port}`);
            logger.info(`Environment: ${process.env.NODE_ENV}`);
        });
    }

    async shutdown() {
        logger.info('Shutting down server gracefully...');
        
        this.server.close(() => {
            logger.info('Server closed');
            process.exit(0);
        });

        // Force close after 10 seconds
        setTimeout(() => {
            logger.error('Force closing server');
            process.exit(1);
        }, 10000);
    }
}

// Start server if this file is run directly
if (require.main === module) {
    const server = new KioskManagementServer();
    server.start().catch(error => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}

module.exports = KioskManagementServer;
