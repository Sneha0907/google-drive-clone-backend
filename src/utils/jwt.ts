import jwt, { SignOptions } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

export function generateToken(
  payload: object,
  expiresIn: string = '7d'
): string {
  const opts: SignOptions = { expiresIn: expiresIn as SignOptions['expiresIn'] };
  return jwt.sign(payload, JWT_SECRET, opts);
}

export function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET);
}
