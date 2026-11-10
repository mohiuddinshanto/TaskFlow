import { Router, Response } from 'express';
import { database } from '../db';
import { authenticate, AuthenticatedRequest } from '../auth';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../../src/lib/auth';

export const authRouter = Router();

// GET all users (for team assignees and project members)
authRouter.get('/users', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const users = database.getUsers().map((u) => {
    const { passwordHash, ...safe } = u;
    return safe;
  });
  res.json(users);
});

// PATCH /api/auth/profile
authRouter.patch('/profile', authenticate, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { name, jobTitle, department, avatar } = req.body;
  const updates: any = {};
  if (name && typeof name === 'string') updates.name = name.trim();
  if (jobTitle && typeof jobTitle === 'string') updates.jobTitle = jobTitle.trim();
  if (department && typeof department === 'string') updates.department = department.trim();
  if (avatar && typeof avatar === 'string') updates.avatar = avatar.trim();

  const updated = database.updateUser(req.user.id, updates);
  if (!updated) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const { passwordHash: _, ...safeUser } = updated;
  res.json(safeUser);
});

authRouter.patch('/password', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8) {
    res.status(400).json({ error: 'Current password and a new password of at least 8 characters are required.' });
    return;
  }
  try {
    const result = await auth.api.changePassword({
      headers: fromNodeHeaders(req.headers),
      body: { currentPassword, newPassword },
    });
    res.json({ message: 'Password updated successfully.', ...result });
  } catch {
    res.status(400).json({ error: 'Could not change password. Check your current password and try again.' });
  }
});


