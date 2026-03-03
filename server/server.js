require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { setIO } = require('./utils/realtime');

const authRoutes = require('./routes/authRoutes');
const internRoutes = require('./routes/internRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const salaryRoutes = require('./routes/salaryRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const app = express();
const server = http.createServer(app);

const allowedOrigins = process.env.NODE_ENV === 'production'
    ? true
    : [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
    ];

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        if (allowedOrigins === true || !origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
}));
app.use(express.json());

const io = new Server(server, {
    cors: {
        origin: allowedOrigins === true ? true : allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: allowedOrigins !== true,
    },
});

setIO(io);

io.on('connection', (socket) => {
    console.log(`Realtime client connected: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`Realtime client disconnected: ${socket.id}`);
    });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/interns', internRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve React frontend in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../client/dist')));
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../client/dist', 'index.html'));
    });
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

// Connect DB & Start Server
const PORT = process.env.PORT || 5000;

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log('MongoDB connected successfully');
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('MongoDB connection error:', err.message);
        process.exit(1);
    });
