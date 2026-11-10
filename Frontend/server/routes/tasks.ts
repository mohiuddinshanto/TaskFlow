import { Router, Response } from 'express';
import { database } from '../db';
import { authenticate, AuthenticatedRequest } from '../auth';
import { Task, TaskPriority, TaskStatus } from '../../src/types/index';
import { filterAndSortTasks } from '../../src/utils/taskCalculations';

export const tasksRouter = Router();

const VALID_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'review', 'completed'];
const VALID_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

// Helper to check user membership in a project
function checkProjectAccess(userId: string, userRole: string, project: any): { hasAccess: boolean; isOwner: boolean } {
  if (userRole === 'admin') return { hasAccess: true, isOwner: true };
  const isOwner = project.ownerId === userId;
  const isMember = isOwner || (Array.isArray(project.members) && project.members.some((m: any) => m.userId === userId));
  return { hasAccess: isMember, isOwner };
}

// GET /api/tasks - list tasks with filtering & authorization
tasksRouter.get('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { projectId, status, priority, assignedTo, search, sortBy, sortOrder } = req.query;

  // Verify access if querying a specific project
  if (projectId) {
    const project = database.getProjectById(projectId as string);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const { hasAccess } = checkProjectAccess(user.id, user.role, project);
    if (!hasAccess) {
      res.status(403).json({ error: 'Forbidden: You do not have permission to view tasks in this project.' });
      return;
    }
  }

  // Get all tasks or tasks for the project
  let allTasks = database.getTasks(projectId as string | undefined);

  // If user is not admin and no specific project was filtered, only return tasks from accessible projects
  if (user.role !== 'admin' && !projectId) {
    const accessibleProjects = database.getProjects().filter(
      (p) => p.ownerId === user.id || (Array.isArray(p.members) && p.members.some((m) => m.userId === user.id))
    );
    const accessibleProjectIds = new Set(accessibleProjects.map((p) => p.id));
    allTasks = allTasks.filter((t) => accessibleProjectIds.has(t.projectId));
  }

  // Apply filters and sorting
  const filtered = filterAndSortTasks(allTasks, {
    projectId: projectId as string,
    status: status as TaskStatus,
    priority: priority as TaskPriority,
    assignedTo: assignedTo as string,
    search: search as string,
    sortBy: sortBy as any,
    sortOrder: sortOrder as any,
  });

  res.json(filtered);
});

// GET /api/tasks/:id - single task details
tasksRouter.get('/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const task = database.getTaskById(req.params.id);

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const project = database.getProjectById(task.projectId);
  if (project) {
    const { hasAccess } = checkProjectAccess(user.id, user.role, project);
    if (!hasAccess) {
      res.status(403).json({ error: 'Forbidden: You do not have access to this task.' });
      return;
    }
  }

  res.json(task);
});

// POST /api/tasks - create new task
tasksRouter.post('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const {
    projectId,
    title,
    description,
    status,
    priority,
    assignedTo,
    labels,
    startDate,
    dueDate,
    estimatedHours,
  } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    res.status(400).json({ error: 'Task title is required.' });
    return;
  }

  if (!projectId) {
    res.status(400).json({ error: 'Project ID is required.' });
    return;
  }

  const project = database.getProjectById(projectId);
  if (!project) {
    res.status(404).json({ error: 'Target project does not exist.' });
    return;
  }

  // Permission check: user must belong to project or be admin
  const { hasAccess } = checkProjectAccess(user.id, user.role, project);
  if (!hasAccess) {
    res.status(403).json({ error: 'Forbidden: You must be a project member or owner to create tasks in this project.' });
    return;
  }

  if (description !== undefined && typeof description !== 'string') {
    res.status(400).json({ error: 'Task description must be text.' });
    return;
  }
  if (assignedTo) {
    const assignee = database.getUserById(assignedTo);
    const eligible = assignee && (user.role === 'admin' || assignee.id === project.ownerId || project.members.some((m) => m.userId === assignee.id));
    if (!eligible) {
      res.status(400).json({ error: 'Assignee must be an eligible member of this project.' });
      return;
    }
  }
  if (labels !== undefined && (!Array.isArray(labels) || labels.some((label: unknown) => typeof label !== 'string'))) {
    res.status(400).json({ error: 'Labels must be an array of text values.' });
    return;
  }

  // Validation
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    return;
  }
  if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
    res.status(400).json({ error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` });
    return;
  }
  const validDate = (value: unknown) => value === undefined || value === '' || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
  if (!validDate(startDate) || !validDate(dueDate)) {
    res.status(400).json({ error: 'Task dates must be valid date strings.' });
    return;
  }
  if (startDate && dueDate && Date.parse(dueDate) < Date.parse(startDate)) {
    res.status(400).json({ error: 'Task due date must be on or after its start date.' });
    return;
  }
  if (estimatedHours !== undefined && estimatedHours !== '' && (!Number.isFinite(Number(estimatedHours)) || Number(estimatedHours) < 0)) {
    res.status(400).json({ error: 'Estimated hours must be a non-negative number.' });
    return;
  }
  if (title.trim().length > 200) {
    res.status(400).json({ error: 'Task title must be 200 characters or fewer.' });
    return;
  }
  const taskStatus: TaskStatus = status ?? 'todo';
  const taskPriority: TaskPriority = priority ?? 'medium';

  // Calculate order for column
  const columnTasks = database.getTasks(projectId).filter((t) => t.status === taskStatus);
  const nextOrder = columnTasks.length;

  const now = new Date().toISOString();
  const newTask: Task = {
    id: `tsk-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    projectId,
    title: title.trim(),
    description: description || '',
    status: taskStatus,
    priority: taskPriority,
    assignedTo: assignedTo || undefined,
    createdBy: user.id,
    labels: Array.isArray(labels) ? labels.map((l) => String(l).trim()) : [],
    startDate: startDate || now,
    dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
    order: nextOrder,
    estimatedHours: estimatedHours !== undefined && estimatedHours !== '' ? Number(estimatedHours) : undefined,
    createdAt: now,
    updatedAt: now,
  };

  const created = database.createTask(newTask, user.id);
  res.status(201).json(created);
});

// PATCH /api/tasks/:id - update task
tasksRouter.patch('/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const task = database.getTaskById(req.params.id);

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const project = database.getProjectById(task.projectId);
  if (!project) {
    res.status(404).json({ error: 'Associated project not found' });
    return;
  }

  // Authorization check
  const { hasAccess, isOwner } = checkProjectAccess(user.id, user.role, project);
  if (!hasAccess) {
    res.status(403).json({ error: 'Forbidden: You do not have access to this project.' });
    return;
  }

  // Members can change status, comments, or tasks assigned to them; owners and admins can update all fields
  const isCreatorOrAssignee = task.createdBy === user.id || task.assignedTo === user.id;
  const canFullEdit = user.role === 'admin' || isOwner || isCreatorOrAssignee;

  const {
    title,
    description,
    status,
    priority,
    assignedTo,
    labels,
    startDate,
    dueDate,
    order,
    estimatedHours,
    actualHours,
  } = req.body;

  // Validate status if provided
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    return;
  }

  // Validate priority if provided
  if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
    res.status(400).json({ error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` });
    return;
  }
  const validDate = (value: unknown) => value === undefined || value === '' || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
  if (!validDate(startDate) || !validDate(dueDate)) {
    res.status(400).json({ error: 'Task dates must be valid date strings.' });
    return;
  }
  const effectiveStart = startDate ?? task.startDate;
  const effectiveDue = dueDate ?? task.dueDate;
  if (effectiveDue && effectiveStart && Date.parse(effectiveDue) < Date.parse(effectiveStart)) {
    res.status(400).json({ error: 'Task due date must be on or after its start date.' });
    return;
  }
  if (description !== undefined && typeof description !== 'string') {
    res.status(400).json({ error: 'Task description must be text.' });
    return;
  }
  if (labels !== undefined && (!Array.isArray(labels) || labels.some((label: unknown) => typeof label !== 'string'))) {
    res.status(400).json({ error: 'Labels must be an array of text values.' });
    return;
  }
  if (assignedTo !== undefined && assignedTo !== '') {
    const assignee = database.getUserById(assignedTo);
    if (!assignee || (user.role !== 'admin' && assignee.id !== project.ownerId && !project.members.some((m) => m.userId === assignee.id))) {
      res.status(400).json({ error: 'Assignee must be an eligible member of this project.' });
      return;
    }
  }
  if (order !== undefined && (!Number.isFinite(Number(order)) || Number(order) < 0)) {
    res.status(400).json({ error: 'Task order must be a non-negative number.' });
    return;
  }
  if (estimatedHours !== undefined && estimatedHours !== '' && (!Number.isFinite(Number(estimatedHours)) || Number(estimatedHours) < 0)) {
    res.status(400).json({ error: 'Estimated hours must be a non-negative number.' });
    return;
  }
  if (actualHours !== undefined && actualHours !== '' && (!Number.isFinite(Number(actualHours)) || Number(actualHours) < 0)) {
    res.status(400).json({ error: 'Actual hours must be a non-negative number.' });
    return;
  }
  if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0 || title.trim().length > 200)) {
    res.status(400).json({ error: 'Task title must contain 1 to 200 characters.' });
    return;
  }

  const updates: Partial<Task> = {};

  // Status and order can be updated by any project member (e.g. moving cards on Kanban board)
  if (status !== undefined) updates.status = status;
  if (order !== undefined) updates.order = Number(order);

  // Full fields can be edited by owner, admin, or creator/assignee
  if (canFullEdit) {
    if (title !== undefined && typeof title === 'string' && title.trim().length > 0) {
      updates.title = title.trim();
    }
    if (description !== undefined) updates.description = description;
    if (priority !== undefined) updates.priority = priority;
    if (assignedTo !== undefined) updates.assignedTo = assignedTo || undefined;
    if (labels !== undefined && Array.isArray(labels)) updates.labels = labels;
    if (startDate !== undefined) updates.startDate = startDate;
    if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate).toISOString() : undefined;
    if (estimatedHours !== undefined) updates.estimatedHours = estimatedHours === '' ? undefined : Number(estimatedHours);
    if (actualHours !== undefined) updates.actualHours = actualHours === '' ? undefined : Number(actualHours);
  }

  const updated = database.updateTask(req.params.id, updates, user.id);
  res.json(updated);
});

// POST /api/tasks/batch-move - reorder tasks across Kanban columns
tasksRouter.post('/batch-move', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { moves } = req.body as {
    moves: { id: string; status: TaskStatus; order: number }[];
  };

  if (!Array.isArray(moves)) {
    res.status(400).json({ error: 'Moves array is required.' });
    return;
  }

  for (const move of moves) {
    const task = database.getTaskById(move.id);
    if (task) {
      const project = database.getProjectById(task.projectId);
      if (project) {
        const { hasAccess } = checkProjectAccess(user.id, user.role, project);
        if (hasAccess) {
          database.updateTask(
            move.id,
            {
              status: VALID_STATUSES.includes(move.status) ? move.status : task.status,
              order: typeof move.order === 'number' ? move.order : 0,
            },
            user.id
          );
        }
      }
    }
  }

  res.json({ message: 'Tasks updated successfully.' });
});

// DELETE /api/tasks/:id - delete task with strict authorization
tasksRouter.delete('/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const task = database.getTaskById(req.params.id);

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const project = database.getProjectById(task.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  // Authorization: Only admin, project owner, or the task creator can delete the task
  const isOwner = project.ownerId === user.id;
  const isCreator = task.createdBy === user.id;
  const canDelete = user.role === 'admin' || isOwner || isCreator;

  if (!canDelete) {
    res.status(403).json({ error: 'Forbidden: Only the task creator, project owner, or an administrator can delete this task.' });
    return;
  }

  database.deleteTask(req.params.id, user.id);
  res.json({ message: 'Task deleted successfully.' });
});
