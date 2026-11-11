import { Router, Response } from 'express';
import { database } from '../db';
import { authenticate, AuthenticatedRequest } from '../auth';
import { Task, TaskFilterOptions, TaskPriority, TaskStatus } from '../../src/types/index';
import { filterAndSortTasks, isValidDateOnly } from '../../src/utils/taskCalculations';
import { canDeleteTask, canEditTask, getForbiddenTaskEditFields, hasProjectAccess } from '../projectPermissions';

export const tasksRouter = Router();

const VALID_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'review', 'completed'];
const VALID_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

// GET /api/tasks - list tasks with filtering & authorization
tasksRouter.get('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const rawQuery = req.query;

  // Coerce all query params to plain strings to prevent NoSQL-object injection crashing the utility
  function toStr(v: unknown): string | undefined {
    if (v === undefined || v === null) return undefined;
    if (typeof v === 'string') return v;
    if (typeof v === 'object') return undefined; // reject objects (e.g. {$ne: null})
    return String(v);
  }

  const projectId = toStr(rawQuery.projectId);
  const status = toStr(rawQuery.status);
  const priority = toStr(rawQuery.priority);
  const assignedTo = toStr(rawQuery.assignedTo);
  const search = toStr(rawQuery.search);
  const sortBy = toStr(rawQuery.sortBy);
  const sortOrder = toStr(rawQuery.sortOrder);
  const dueDateFilter = toStr(rawQuery.dueDateFilter);
  const dueDateFrom = toStr(rawQuery.dueDateFrom);
  const dueDateTo = toStr(rawQuery.dueDateTo);

  if ((rawQuery.dueDateFrom !== undefined && typeof rawQuery.dueDateFrom !== 'string') ||
      (rawQuery.dueDateTo !== undefined && typeof rawQuery.dueDateTo !== 'string')) {
    res.status(400).json({ error: 'Due-date range boundaries must be single text values.' });
    return;
  }

  const allowedStatuses: TaskStatus[] = ['todo', 'in_progress', 'review', 'completed'];
  const allowedSortFields: NonNullable<TaskFilterOptions['sortBy']>[] = ['dueDate', 'priority', 'createdAt', 'title'];
  if (status && status !== 'all' && !allowedStatuses.includes(status as TaskStatus)) {
    res.status(400).json({ error: 'Invalid task status filter.' });
    return;
  }
  if (priority && priority !== 'all' && !VALID_PRIORITIES.includes(priority as TaskPriority)) {
    res.status(400).json({ error: 'Invalid task priority filter.' });
    return;
  }
  if (sortBy && !allowedSortFields.includes(sortBy as NonNullable<TaskFilterOptions['sortBy']>)) {
    res.status(400).json({ error: 'Invalid task sort field.' });
    return;
  }
  if (sortOrder && sortOrder !== 'asc' && sortOrder !== 'desc') {
    res.status(400).json({ error: 'Invalid task sort order.' });
    return;
  }

  const allowedDueDateFilters = ['overdue', 'today', 'this_week', 'none', 'custom'] as const;
  if (rawQuery.dueDateFilter !== undefined && typeof rawQuery.dueDateFilter !== 'string') {
    res.status(400).json({ error: 'Due-date filter must be a single text value.' });
    return;
  }
  if (dueDateFilter && !allowedDueDateFilters.includes(dueDateFilter as typeof allowedDueDateFilters[number])) {
    res.status(400).json({ error: 'Invalid due-date filter.' });
    return;
  }
  if ((dueDateFrom || dueDateTo) && dueDateFilter !== 'custom') {
    res.status(400).json({ error: 'A custom due-date range requires dueDateFilter=custom.' });
    return;
  }
  if (dueDateFilter === 'custom') {
    if (!dueDateFrom || !dueDateTo || !isValidDateOnly(dueDateFrom) || !isValidDateOnly(dueDateTo)) {
      res.status(400).json({ error: 'Custom due-date ranges require valid YYYY-MM-DD from and to dates.' });
      return;
    }
    if (dueDateFrom > dueDateTo) {
      res.status(400).json({ error: 'Custom due-date range start must be on or before its end.' });
      return;
    }
  }

  // Verify access if querying a specific project
  if (projectId) {
    const project = database.getProjectById(projectId as string);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    if (!hasProjectAccess(project, user)) {
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
    status: status === 'all' ? 'all' : status as TaskStatus | undefined,
    priority: priority === 'all' ? 'all' : priority as TaskPriority | undefined,
    assignedTo,
    search,
    sortBy: sortBy as TaskFilterOptions['sortBy'],
    sortOrder: sortOrder as TaskFilterOptions['sortOrder'],
    dueDateFilter: dueDateFilter as TaskFilterOptions['dueDateFilter'],
    dueDateFrom,
    dueDateTo,
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
    if (!hasProjectAccess(project, user)) {
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
  if (!hasProjectAccess(project, user)) {
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
  if (!hasProjectAccess(project, user)) {
    res.status(403).json({ error: 'Forbidden: You do not have access to this project.' });
    return;
  }

  // Members can change status, comments, or tasks assigned to them; owners and admins can update all fields
  const canFullEdit = canEditTask(project, task, user);

  const forbiddenFields = getForbiddenTaskEditFields(req.body, canFullEdit);
  if (forbiddenFields.length > 0) {
    res.status(403).json({ error: 'Forbidden: You cannot edit these task fields.', fields: forbiddenFields });
    return;
  }

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
        if (hasProjectAccess(project, user)) {
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

  if (!canDeleteTask(project, task, user)) {
    res.status(403).json({ error: 'Forbidden: Only the task creator, project owner, or an administrator can delete this task.' });
    return;
  }

  database.deleteTask(req.params.id, user.id);
  res.json({ message: 'Task deleted successfully.' });
});
