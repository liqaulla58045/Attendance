let ioInstance = null;

const setIO = (io) => {
    ioInstance = io;
};

const getIO = () => ioInstance;

const emitDataRefresh = (payload = {}) => {
    if (!ioInstance) return;

    ioInstance.emit('data:refresh', {
        ts: new Date().toISOString(),
        ...payload,
    });
};

module.exports = { setIO, getIO, emitDataRefresh };
