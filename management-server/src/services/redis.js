const redis = require('redis');
const logger = require('../utils/logger');

let redisClient = null;

async function initRedis() {
    try {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        
        redisClient = redis.createClient({
            url: redisUrl,
            retry_strategy: (options) => {
                if (options.error && options.error.code === 'ECONNREFUSED') {
                    logger.error('Redis server refused connection');
                    return new Error('Redis server refused connection');
                }
                if (options.total_retry_time > 1000 * 60 * 60) {
                    logger.error('Redis retry time exhausted');
                    return new Error('Retry time exhausted');
                }
                if (options.attempt > 10) {
                    logger.error('Redis connection attempts exceeded');
                    return undefined;
                }
                return Math.min(options.attempt * 100, 3000);
            }
        });

        redisClient.on('error', (err) => {
            logger.error('Redis client error:', err);
        });

        redisClient.on('connect', () => {
            logger.info('Connected to Redis server');
        });

        redisClient.on('disconnect', () => {
            logger.warn('Disconnected from Redis server');
        });

        await redisClient.connect();
        logger.info('Redis client initialized successfully');
        
        return redisClient;
    } catch (error) {
        logger.error('Failed to initialize Redis:', error);
        // Don't throw error, allow server to start without Redis
        return null;
    }
}

function getRedisClient() {
    return redisClient;
}

async function setCache(key, value, ttl = 3600) {
    try {
        if (!redisClient) return false;
        await redisClient.setEx(key, ttl, JSON.stringify(value));
        return true;
    } catch (error) {
        logger.error('Redis set error:', error);
        return false;
    }
}

async function getCache(key) {
    try {
        if (!redisClient) return null;
        const value = await redisClient.get(key);
        return value ? JSON.parse(value) : null;
    } catch (error) {
        logger.error('Redis get error:', error);
        return null;
    }
}

async function deleteCache(key) {
    try {
        if (!redisClient) return false;
        await redisClient.del(key);
        return true;
    } catch (error) {
        logger.error('Redis delete error:', error);
        return false;
    }
}

module.exports = {
    initRedis,
    getRedisClient,
    setCache,
    getCache,
    deleteCache
};
