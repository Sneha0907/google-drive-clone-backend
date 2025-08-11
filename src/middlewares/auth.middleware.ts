// src/middlewares/auth.middleware.ts
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const hdr = req.headers.authorization;
  if (!hdr?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const token = hdr.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!);
    (req as any).user = payload; // { id, email, ... }
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
