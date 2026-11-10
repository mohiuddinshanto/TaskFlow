import { Task, TaskFilterOptions, TaskPriority, TaskStatus } from '../types/index';

/**
 * Calculates project completion progress as an integer percentage (0 - 100).
 */
export function calculateProjectProgress(tasks: Task[]): number {
  if (!tasks || tasks.length === 0) return 0;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  return Math.round((completed / tasks.length) * 100);
}

/**
 * Checks if a task is overdue (dueDate passed and task not completed).
 */
export function isTaskOverdue(task: Task, referenceDate: Date = new Date()): boolean {
  if (!task.dueDate || task.status === 'completed') return false;
  const due = new Date(task.dueDate);
  // Set to end of the day or exact comparison
  return due.getTime() < referenceDate.getTime();
}

/**
 * Groups tasks by Kanban column status and sorts by order or priority.
 */
export function groupTasksByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const groups: Record<TaskStatus, Task[]> = {
    todo: [],
    in_progress: [],
    review: [],
    completed: [],
  };

  for (const task of tasks) {
    if (groups[task.status]) {
      groups[task.status].push(task);
    } else {
      groups.todo.push(task);
    }
  }

  // Sort each column by order
  for (const status of Object.keys(groups) as TaskStatus[]) {
    groups[status].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  return groups;
}

/**
 * Priority rank mapping for sorting
 */
export const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Filters and sorts tasks based on filter options
 */
export function filterAndSortTasks(tasks: Task[], options: TaskFilterOptions): Task[] {
  let result = [...tasks];

  // Project filter
  if (options.projectId) {
    result = result.filter((t) => t.projectId === options.projectId);
  }

  // Search filter (title, description, or labels)
  if (options.search && options.search.trim().length > 0) {
    const query = options.search.toLowerCase().trim();
    result = result.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        (t.description && t.description.toLowerCase().includes(query)) ||
        t.labels.some((l) => l.toLowerCase().includes(query))
    );
  }

  // Status filter
  if (options.status && options.status !== 'all') {
    result = result.filter((t) => t.status === options.status);
  }

  // Priority filter
  if (options.priority && options.priority !== 'all') {
    result = result.filter((t) => t.priority === options.priority);
  }

  // Assignee filter
  if (options.assignedTo && options.assignedTo !== 'all') {
    result = result.filter((t) => t.assignedTo === options.assignedTo);
  }

  // Sorting
  const sortBy = options.sortBy || 'createdAt';
  const sortOrder = options.sortOrder || 'desc';
  const modifier = sortOrder === 'asc' ? 1 : -1;

  result.sort((a, b) => {
    if (sortBy === 'priority') {
      const weightA = PRIORITY_WEIGHTS[a.priority] || 0;
      const weightB = PRIORITY_WEIGHTS[b.priority] || 0;
      return (weightA - weightB) * modifier;
    }
    if (sortBy === 'dueDate') {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return (new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()) * modifier;
    }
    if (sortBy === 'title') {
      return a.title.localeCompare(b.title) * modifier;
    }
    // Default: createdAt
    return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * modifier;
  });

  return result;
}

/**
 * Count unread notifications
 */
export function countUnreadNotifications(notifications: { isRead: boolean }[]): number {
  if (!notifications) return 0;
  return notifications.filter((n) => !n.isRead).length;
}
