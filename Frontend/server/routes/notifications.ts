import { Router, Response } from 'express';
import { database } from '../db';
import { authenticate, AuthenticatedRequest } from '../auth';

export const notificationsRouter = Router();

// GET /api/notifications
notificationsRouter.get('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const now = Date.now();
  const existing = database.getNotifications(user.id);
  const existingDeadlineTasks = new Set(existing
    .filter((notification) => notification.type === 'deadline_approaching')
    .map((notification) => notification.relatedTaskId));
  for (const task of database.getTasks()) {
    const dueAt = task.dueDate ? Date.parse(task.dueDate) : NaN;
    if (task.assignedTo === user.id && task.status !== 'completed' && Number.isFinite(dueAt) && dueAt >= now && dueAt <= now + 24 * 60 * 60 * 1000 && !existingDeadlineTasks.has(task.id)) {
      database.createNotification({
        recipientId: user.id,
        type: 'deadline_approaching',
        message: `Task "${task.title}" is due within the next 24 hours.`,
        relatedProjectId: task.projectId,
        relatedTaskId: task.id,
      });
    }
  }
  const notifs = database.getNotifications(user.id);
  res.json(notifs);
});

// PATCH /api/notifications/:id/read
notificationsRouter.patch('/:id/read', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const updated = database.markNotificationRead(req.params.id, user.id);
  if (!updated) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }
  res.json(updated);
});

// PATCH /api/notifications/read-all
notificationsRouter.patch('/read-all', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  database.markAllNotificationsRead(user.id);
  res.json({ message: 'All notifications marked as read' });
});
