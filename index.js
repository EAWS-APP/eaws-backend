const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const { supabaseAdmin } = require('./config/supabase');
const incidentRoutes = require('./routes/incidents');
const responseRoutes = require('./routes/responses');
const alertRoutes = require('./routes/alerts');
const communityRoutes = require('./routes/community');
const agencyRoutes = require('./routes/agencies');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'EAWS Backend is running',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', incidentRoutes);
app.use('/api', responseRoutes);
app.use('/api', alertRoutes);
app.use('/api/community', communityRoutes);
app.use('/api', agencyRoutes);
app.use('/api', authRoutes);
app.use('/api', adminRoutes);


app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

app.listen(PORT, () => {
  console.log(`EAWS Backend Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, supabase: supabaseAdmin };
