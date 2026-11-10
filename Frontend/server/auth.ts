import type { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../src/lib/auth';
import { database } from './db';
import type { User, UserRole } from '../src/types/index';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session?.user) {
      res.status(401).json({ error: 'Authentication required. Please sign in.' });
      return;
    }

    const storedUser = database.getUserById(session.user.id) || database.getUserByEmail(session.user.email);
    req.user = storedUser
      ? (({ passwordHash: _passwordHash, ...safeUser }) => safeUser)(storedUser as User & { passwordHash?: string })
      : {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          avatar: session.user.image || undefined,
          role: 'member',
          jobTitle: 'Team Member',
          department: 'Operations',
          createdAt: session.user.createdAt.toISOString(),
          updatedAt: session.user.updatedAt.toISOString(),
        };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (req.user.role === 'admin' || allowedRoles.includes(req.user.role)) {
      next();
      return;
    }
    res.status(403).json({ error: 'Forbidden: Insufficient privileges.' });
  };
}
