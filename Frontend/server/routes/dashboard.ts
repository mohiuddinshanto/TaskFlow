import { Router, Response } from 'express';
import { database, seedInitialData, getDatabaseStatus } from '../db';
import { authenticate, AuthenticatedRequest } from '../auth';
import { DashboardStats, TaskStatus, TaskPriority } from '../../src/types/index';
import { calculateProjectProgress, isTaskOverdue } from '../../src/utils/taskCalculations';

export const dashboardRouter = Router();

// GET /api/dashboard/status
dashboardRouter.get('/status', (req, res) => {
  res.json(getDatabaseStatus());
});

// GET /api/dashboard/stats
dashboardRouter.get('/stats', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const allProjects = database.getProjects();
  const allTasks = database.getTasks();

  // If not admin, restrict to user projects
  const accessibleProjects =
    user.role === 'admin'
      ? allProjects
      : allProjects.filter(
          (p) => p.ownerId === user.id || p.members.some((m) => m.userId === user.id)
        );

  const accessibleProjectIds = new Set(accessibleProjects.map((p) => p.id));
  const tasks = allTasks.filter((t) => accessibleProjectIds.has(t.projectId));

  const totalProjects = accessibleProjects.length;
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const reviewTasks = tasks.filter((t) => t.status === 'review').length;
  const pendingTasks = tasks.filter((t) => t.status === 'todo').length;

  const now = new Date();
  const overdueTasks = tasks.filter((t) => isTaskOverdue(t, now)).length;

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Upcoming deadlines (within next 14 days, not completed)
  const upcomingDeadlines = tasks
    .filter((t) => t.dueDate && t.status !== 'completed' && new Date(t.dueDate) >= now)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 6);

  // Status distribution
  const statusDistribution: { status: TaskStatus; count: number }[] = [
    { status: 'todo', count: pendingTasks },
    { status: 'in_progress', count: inProgressTasks },
    { status: 'review', count: reviewTasks },
    { status: 'completed', count: completedTasks },
  ];

  // Priority distribution
  const priorityDistribution: { priority: TaskPriority; count: number }[] = [
    { priority: 'urgent', count: tasks.filter((t) => t.priority === 'urgent').length },
    { priority: 'high', count: tasks.filter((t) => t.priority === 'high').length },
    { priority: 'medium', count: tasks.filter((t) => t.priority === 'medium').length },
    { priority: 'low', count: tasks.filter((t) => t.priority === 'low').length },
  ];

  const recentProjects = [...accessibleProjects]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4);

  const recentActivities = database.getActivities(100)
    .filter((activity) => activity.projectId && accessibleProjectIds.has(activity.projectId))
    .slice(0, 10);

  const stats: DashboardStats = {
    totalProjects,
    totalTasks,
    completedTasks,
    pendingTasks,
    inProgressTasks,
    reviewTasks,
    overdueTasks,
    completionRate,
    recentProjects,
    recentActivities,
    upcomingDeadlines,
    statusDistribution,
    priorityDistribution,
  };

  res.json(stats);
});

// POST /api/dashboard/reset-data (reset to fresh seed data)
dashboardRouter.post('/reset-data', authenticate, (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Only admins can reset the workspace data.' });
    return;
  }
  seedInitialData();
  res.json({ message: 'Workspace demo data restored to initial baseline.' });
});
