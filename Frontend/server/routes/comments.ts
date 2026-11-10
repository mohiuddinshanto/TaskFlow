import { Router, Response } from 'express';
import { database } from '../db';
import { authenticate, AuthenticatedRequest } from '../auth';

export const commentsRouter = Router();

// GET /api/tasks/:taskId/comments
commentsRouter.get('/task/:taskId', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const task = database.getTaskById(req.params.taskId);

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const project = database.getProjectById(task.projectId);
  if (project && user.role !== 'admin') {
    const isMember =
      project.ownerId === user.id ||
      (Array.isArray(project.members) && project.members.some((m) => m.userId === user.id));
    if (!isMember) {
      res.status(403).json({ error: 'Forbidden: You do not have access to this task comments.' });
      return;
    }
  }

  const comments = database.getCommentsByTask(req.params.taskId);
  res.json(comments);
});

// POST /api/tasks/:taskId/comments
commentsRouter.post('/task/:taskId', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { content } = req.body;

  if (!content || typeof content !== 'string' || content.trim().length === 0 || content.length > 4000) {
    res.status(400).json({ error: 'Comment content must contain 1 to 4000 characters.' });
    return;
  }

  const task = database.getTaskById(req.params.taskId);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const project = database.getProjectById(task.projectId);
  if (project && user.role !== 'admin') {
    const isMember =
      project.ownerId === user.id ||
      (Array.isArray(project.members) && project.members.some((m) => m.userId === user.id));
    if (!isMember) {
      res.status(403).json({ error: 'Forbidden: You must be a project member to comment on this task.' });
      return;
    }
  }

  const newComment = database.createComment({
    taskId: req.params.taskId,
    authorId: user.id,
    content: content.trim(),
  });

  database.logActivity({
    userId: user.id,
    projectId: task.projectId,
    taskId: task.id,
    action: 'commented_task',
    details: `Commented on "${task.title}"`,
  });

  res.status(201).json(newComment);
});

// PATCH /api/comments/:id
commentsRouter.patch('/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { content } = req.body;

  if (!content || typeof content !== 'string' || content.trim().length === 0 || content.length > 4000) {
    res.status(400).json({ error: 'Comment content must contain 1 to 4000 characters.' });
    return;
  }

  const updated = database.updateComment(req.params.id, content.trim(), user.id);
  if (!updated) {
    res.status(403).json({ error: 'Forbidden: Only the original author can edit this comment.' });
    return;
  }

  res.json(updated);
});

// DELETE /api/comments/:id
commentsRouter.delete('/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const isAdmin = user.role === 'admin';

  const deleted = database.deleteComment(req.params.id, user.id, isAdmin);
  if (!deleted) {
    res.status(403).json({ error: 'Forbidden: Only the comment author or an administrator can delete this comment.' });
    return;
  }

  res.json({ message: 'Comment deleted successfully.' });
});
