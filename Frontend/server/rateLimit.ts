import { Request, Response, NextFunction } from 'express';

type Entry = { count: number; resetAt: number };
const attempts = new Map<string, Entry>();

/** Small per-process limiter for sensitive endpoints; deploy shared storage when horizontally scaling. */
export function rateLimit(maxAttempts = 10, windowMs = 15 * 60 * 1000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const current = attempts.get(key);
    if (!current || current.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    current.count += 1;
    if (current.count > maxAttempts) {
      res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
      res.status(429).json({ error: 'Too many attempts. Please try again later.' });
      return;
    }
    next();
  };
}
