import { randomBytes } from 'node:crypto';
import { auth } from '../src/lib/auth';
import { database, flushMongoWrites } from './db';
import { Activity, Comment, Notification, Project, Task, User } from '../src/types';

export const DEMO_EMAIL = 'demo@taskflow.app';
export const DEMO_PASSWORD = 'TaskFlowDemo2026!';

let preparing: Promise<void> | null = null;

/** Creates the shared demo login and a representative workspace once per database. */
export function prepareDemoWorkspace(): Promise<void> {
  preparing ??= createDemoWorkspace().finally(() => { preparing = null; });
  return preparing;
}

async function createDemoWorkspace(): Promise<void> {
  if (!database.getUserByEmail(DEMO_EMAIL)) {
    try {
      await auth.api.signUpEmail({
        body: { name: 'TaskFlow Demo', email: DEMO_EMAIL, password: DEMO_PASSWORD },
        headers: new Headers({ origin: process.env.BETTER_AUTH_URL || 'http://localhost:3000' }),
      });
    } catch {
      // The Better Auth account may already exist from an earlier deployment.
    }
  }

  const demo = database.getUserByEmail(DEMO_EMAIL);
  if (!demo) throw new Error('Demo account could not be initialized.');
  if (demo.role !== 'admin') database.updateUser(demo.id, { role: 'admin' });
  if (database.getProjectById('demo-product-launch')) return;

  const now = new Date();
  const iso = (days: number) => new Date(now.getTime() + days * 86400000).toISOString();
  const team: User[] = [
    { id: 'demo-user-ava', name: 'Ava Chen', email: 'ava.demo@taskflow.app', role: 'member', jobTitle: 'Product Designer', department: 'Design', createdAt: iso(-30), updatedAt: iso(-2) },
    { id: 'demo-user-omar', name: 'Omar Ali', email: 'omar.demo@taskflow.app', role: 'member', jobTitle: 'Frontend Engineer', department: 'Engineering', createdAt: iso(-25), updatedAt: iso(-1) },
    { id: 'demo-user-mia', name: 'Mia Patel', email: 'mia.demo@taskflow.app', role: 'member', jobTitle: 'QA Engineer', department: 'Quality', createdAt: iso(-20), updatedAt: iso(-3) },
  ];
  for (const user of team) {
    if (!database.getUserById(user.id)) await database.createUser({ ...user, passwordHash: randomBytes(32).toString('hex') });
  }

  const projectId = 'demo-product-launch';
  const project: Project = {
    id: projectId, name: 'Product Launch', description: 'A sample workspace to explore projects, task tracking, team collaboration, and notifications.',
    ownerId: demo.id,
    members: [{ userId: demo.id, role: 'owner', joinedAt: iso(-14) }, { userId: team[0].id, role: 'admin', joinedAt: iso(-12) }, { userId: team[1].id, role: 'member', joinedAt: iso(-10) }, { userId: team[2].id, role: 'member', joinedAt: iso(-8) }],
    status: 'active', startDate: iso(-14), dueDate: iso(20), color: '#6366F1', category: 'Product', createdAt: iso(-14), updatedAt: iso(-1),
  };
  database.createProject(project);

  const taskRows: Array<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'assignedTo' | 'labels' | 'dueDate' | 'estimatedHours'>> = [
    { title: 'Map the onboarding journey', description: 'Review the current signup flow and document the key user steps.', status: 'completed', priority: 'medium', assignedTo: team[0].id, labels: ['research', 'ux'], dueDate: iso(-5), estimatedHours: 5 },
    { title: 'Design the dashboard overview', description: 'Create responsive dashboard layouts for desktop and mobile.', status: 'in_progress', priority: 'high', assignedTo: team[0].id, labels: ['design', 'dashboard'], dueDate: iso(3), estimatedHours: 8 },
    { title: 'Build project creation flow', description: 'Implement the project form with validation and member selection.', status: 'review', priority: 'urgent', assignedTo: team[1].id, labels: ['frontend', 'projects'], dueDate: iso(1), estimatedHours: 6 },
    { title: 'Add task filters', description: 'Support filtering by status, priority, assignee, and due date.', status: 'todo', priority: 'high', assignedTo: team[1].id, labels: ['frontend', 'tasks'], dueDate: iso(7), estimatedHours: 4 },
    { title: 'Run cross-browser checks', description: 'Verify the main workflows in current desktop browsers.', status: 'todo', priority: 'low', assignedTo: team[2].id, labels: ['qa'], dueDate: iso(12), estimatedHours: 3 },
    { title: 'Resolve overdue sample task', description: 'This intentionally overdue item demonstrates dashboard and due-date indicators.', status: 'in_progress', priority: 'urgent', assignedTo: demo.id, labels: ['demo', 'urgent'], dueDate: iso(-2), estimatedHours: 2 },
  ];
  const tasks: Task[] = taskRows.map((row, index) => ({ ...row, id: `demo-task-${index + 1}`, projectId, createdBy: demo.id, order: index, startDate: iso(-7 + index), createdAt: iso(-10 + index), updatedAt: iso(-1) }));
  for (const task of tasks) database.createTask(task, demo.id);

  const comments: Array<Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>> = [
    { taskId: tasks[1].id, authorId: team[0].id, content: 'The first dashboard draft is ready for review.' },
    { taskId: tasks[2].id, authorId: demo.id, content: 'Thanks! Please include the empty state before merging.' },
    { taskId: tasks[3].id, authorId: team[1].id, content: 'I will add the due-date filter alongside the status filters.' },
  ];
  comments.forEach((comment) => database.createComment(comment));
  const notifications: Array<Omit<Notification, 'id' | 'isRead' | 'createdAt'>> = [
    { recipientId: demo.id, type: 'comment_added', message: 'Ava Chen commented on “Design the dashboard overview”', relatedProjectId: projectId, relatedTaskId: tasks[1].id },
    { recipientId: demo.id, type: 'deadline_approaching', message: '“Build project creation flow” is due soon', relatedProjectId: projectId, relatedTaskId: tasks[2].id },
  ];
  notifications.forEach((notification) => database.createNotification(notification));
  const activities: Array<Omit<Activity, 'id' | 'createdAt'>> = [
    { userId: team[0].id, projectId, taskId: tasks[1].id, action: 'updated_task', details: 'Updated “Design the dashboard overview”' },
    { userId: team[1].id, projectId, taskId: tasks[2].id, action: 'status_changed', details: 'Moved “Build project creation flow” to review' },
  ];
  activities.forEach((activity) => database.logActivity(activity));
  await flushMongoWrites();
}
