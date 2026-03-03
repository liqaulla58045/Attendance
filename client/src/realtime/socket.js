import { io } from 'socket.io-client';

let socket;

const getSocketUrl = () => {
    if (import.meta.env.PROD) {
        return window.location.origin;
    }
    return 'http://localhost:5000';
};

export const getRealtimeSocket = () => {
    if (!socket) {
        socket = io(getSocketUrl(), {
            transports: ['websocket', 'polling'],
            autoConnect: true,
        });
    }

    return socket;
};

export const subscribeDataRefresh = (callback) => {
    const realtimeSocket = getRealtimeSocket();
    realtimeSocket.on('data:refresh', callback);

    return () => {
        realtimeSocket.off('data:refresh', callback);
    };
};

export const disconnectRealtime = () => {
    if (!socket) return;
    socket.disconnect();
    socket = undefined;
};
