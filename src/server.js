require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const checkinRoutes = require('./routes/checkins');
const userRoutes = require('./routes/users');
const reportRoutes = require('./routes/reports');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' })); // face descriptor payloads can be sizeable

app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/checkins', checkinRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Serve the frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SmartAttend server running on http://localhost:${PORT}`);
});

module.exports = app;
