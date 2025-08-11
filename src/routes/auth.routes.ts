// src/routes/auth.routes.ts
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../db.js';

const router = Router();

router.post('/signup', async (req, res) => {
  console.log('📩 Incoming SIGNUP request:', req.body);

  const { email, password } = req.body;
  if (!email || !password) {
    console.warn('⚠️ Missing email or password');
    return res.status(400).json({ error: 'email & password required' });
  }

  try {
    console.log('🔐 Hashing password...');
    const hash = await bcrypt.hash(password, 10);

    console.log('💾 Inserting user into Supabase...');
    const { data, error } = await supabase
      .from('users')
      .insert([{ email, password: hash }])
      .select('id,email,created_at')
      .single();

    if (error) {
      console.error('❌ Supabase insert error:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('✅ User inserted:', data);

    console.log('🎟 Generating JWT token...');
    const token = jwt.sign(
      { id: data.id, email: data.email },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    console.log('✅ Signup successful for:', email);
    res.json({ user: data, token });

  } catch (err) {
    console.error('🔥 SIGNUP exception:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  console.log('📩 Incoming LOGIN request:', req.body);

  const { email, password } = req.body;
  if (!email || !password) {
    console.warn('⚠️ Missing email or password');
    return res.status(400).json({ error: 'email & password required' });
  }

  try {
    console.log('🔍 Checking user in Supabase...');
    const { data: user, error } = await supabase
      .from('users')
      .select('id,email,password')
      .eq('email', email)
      .single();

    if (error) {
      console.error('❌ Supabase query error:', error);
      return res.status(500).json({ error: error.message });
    }

    if (!user) {
      console.warn('⚠️ User not found:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('🔑 Comparing passwords...');
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      console.warn('⚠️ Invalid password for:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('🎟 Generating JWT token...');
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    console.log('✅ Login successful for:', email);
    res.json({ token });

  } catch (err) {
    console.error('🔥 LOGIN exception:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
