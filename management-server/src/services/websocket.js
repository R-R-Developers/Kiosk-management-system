const logger = require('../utils/logger');

function setupWebSocket(io) {
    logger.info('Setting up WebSocket server');

    // Middleware for WebSocket authentication
    io.use((socket, next) => {
        // TODO: Implement WebSocket authentication
        logger.info(`WebSocket connection attempt from ${socket.handshake.address}`);
        next();
    });

    io.on('connection', (socket) => {
        logger.info(`Client connected: ${socket.id}`);

        // Handle device registration
        socket.on('device:register', (data) => {
            logger.info(`Device registration: ${JSON.stringify(data)}`);
            socket.join('devices');
            socket.emit('device:registered', { success: true });
        });

        // Handle device heartbeat
        socket.on('device:heartbeat', (data) => {
            logger.debug(`Device heartbeat: ${JSON.stringify(data)}`);
            socket.emit('device:heartbeat:ack', { timestamp: Date.now() });
        });

        // Handle device status updates
        socket.on('device:status', (data) => {
            logger.info(`Device status update: ${JSON.stringify(data)}`);
            socket.to('admin').emit('device:status:update', data);
        });

        // Handle admin connections
        socket.on('admin:join', (data) => {
            logger.info(`Admin joined: ${JSON.stringify(data)}`);
            socket.join('admin');
            socket.emit('admin:joined', { success: true });
        });

        // Handle device commands from admin
        socket.on('device:command', (data) => {
            logger.info(`Device command: ${JSON.stringify(data)}`);
            const { deviceId, command } = data;
            socket.to(`device:${deviceId}`).emit('command', command);
        });

        // Handle application deployment
        socket.on('app:deploy', (data) => {
            logger.info(`Application deployment: ${JSON.stringify(data)}`);
            const { deviceId, appData } = data;
            socket.to(`device:${deviceId}`).emit('app:deploy', appData);
        });

        // Handle configuration updates
        socket.on('config:update', (data) => {
            logger.info(`Configuration update: ${JSON.stringify(data)}`);
            const { deviceId, config } = data;
            socket.to(`device:${deviceId}`).emit('config:update', config);
        });

        // Handle disconnection
        socket.on('disconnect', (reason) => {
            logger.info(`Client disconnected: ${socket.id}, reason: ${reason}`);
        });

        // Handle errors
        socket.on('error', (error) => {
            logger.error(`WebSocket error for ${socket.id}:`, error);
        });
    });

    return io;
}

// Utility functions for broadcasting
function broadcastToDevices(io, event, data) {
    io.to('devices').emit(event, data);
}

function broadcastToAdmins(io, event, data) {
    io.to('admin').emit(event, data);
}

function sendToDevice(io, deviceId, event, data) {
    io.to(`device:${deviceId}`).emit(event, data);
}

module.exports = {
    setupWebSocket,
    broadcastToDevices,
    broadcastToAdmins,
    sendToDevice
};
