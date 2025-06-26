const logger = require('../utils/logger');

/**
 * Global error handler middleware
 */
function errorHandler(error, req, res, next) {
    // Log error
    logger.error('Unhandled error:', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id
    });
    
    // Default error response
    let statusCode = 500;
    let message = 'Internal server error';
    
    // Handle specific error types
    if (error.name === 'ValidationError') {
        statusCode = 400;
        message = 'Validation failed';
    } else if (error.name === 'UnauthorizedError') {
        statusCode = 401;
        message = 'Unauthorized';
    } else if (error.name === 'ForbiddenError') {
        statusCode = 403;
        message = 'Forbidden';
    } else if (error.name === 'NotFoundError') {
        statusCode = 404;
        message = 'Resource not found';
    } else if (error.name === 'ConflictError') {
        statusCode = 409;
        message = 'Resource conflict';
    } else if (error.code === '23505') { // PostgreSQL unique violation
        statusCode = 409;
        message = 'Resource already exists';
    } else if (error.code === '23503') { // PostgreSQL foreign key violation
        statusCode = 400;
        message = 'Invalid reference';
    } else if (error.code === '23502') { // PostgreSQL not null violation
        statusCode = 400;
        message = 'Required field missing';
    }
    
    // Send error response
    res.status(statusCode).json({
        error: message,
        ...(process.env.NODE_ENV === 'development' && {
            details: error.message,
            stack: error.stack
        })
    });
}

module.exports = errorHandler;
