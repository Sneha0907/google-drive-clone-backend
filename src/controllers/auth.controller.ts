import bcrypt from 'bcrypt';
import { supabase } from '../db.js';
import { generateToken } from '../utils/jwt.js';
import { Request, Response } from 'express';

const SALT_ROUNDS = 10;

export async function signup(req: Request, res: Response) {
  const { email, password } = req.body;

  const { data: existingUser } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (existingUser) return res.status(400).json({ error: 'User already exists' });

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const { data: user, error } = await supabase
    .from('users')
    .insert([{ email, password: hashedPassword }])
    .select()
    .single();

  if (error) return res.status(500).json({ error });

  const token = generateToken({ id: user.id, email: user.email });

  res.json({ user, token });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !user) return res.status(401).json({ error: 'Invalid credentials' });

  const match = await bcrypt.compare(password, user.password);

  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

  const token = generateToken({ id: user.id, email: user.email });

  res.json({ user, token });
}
