// src/index.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
import authRoutes from './routes/auth.routes.js';
import filesRoutes from './routes/files.routes.js';
import foldersRoutes from './routes/folders.routes.js';
import sharesRoutes from './routes/shares.routes.js';
import searchRoutes from './routes/search.routes.js';

app.use('/api/auth', authRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/folders', foldersRoutes);
app.use('/api/shares', sharesRoutes);
app.use('/api/search', searchRoutes);

// Health check
app.get('/', (_req, res) => res.send('✅ Google Drive Clone API is running'));

// Error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('🔥 Unhandled Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
