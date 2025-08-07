import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import uploadRoutes from './routes/upload.routes.js';

try {
  dotenv.config(); // ✅ Step 1: Load env

  const app = express();
  const PORT = process.env.PORT || 5000;

  app.use(cors());
  app.use(express.json());
  app.use('/api/files', uploadRoutes);

  // ✅ Step 2: Try importing routes INSIDE try-catch
  const authRoutes = await import('./routes/auth.routes.js');
  app.use('/api/auth', authRoutes.default); // ESM default export

  // ✅ Step 3: Catch-all error handler
  app.use(
    (err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error('🔥 Unhandled Error:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: err.message,
        stack: err.stack,
      });
    }
  );

  app.get('/', (_req, res) => {
    res.send('✅ Keep It Safe API is running');
    });


  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
} catch (err) {
  console.error('🛑 Fatal Startup Error:', err);
  process.exit(1); // Stop the server
}
