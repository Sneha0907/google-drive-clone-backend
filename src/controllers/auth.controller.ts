import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import { supabase } from '../db.js';
import { generateToken } from '../utils/jwt.js';

const SALT = 10;

export async function signup(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };

  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) return res.status(400).json({ error: 'User already exists' });

  const hash = await bcrypt.hash(password, SALT);

  const { data: user, error } = await supabase
    .from('users')
    .insert([{ email, password: hash }])
    .select('id,email,created_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const token = generateToken({ id: user.id, email: user.email });
  res.json({ user, token });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !user) return res.status(401).json({ error: 'Not found' });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = generateToken({ id: user.id, email: user.email });
  res.json({ user: { id: user.id, email: user.email }, token });
}
