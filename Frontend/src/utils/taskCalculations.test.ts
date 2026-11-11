import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateProjectProgress,
  isTaskOverdue,
  groupTasksByStatus,
  filterAndSortTasks,
  countUnreadNotifications,
  isValidDateOnly,
} from './taskCalculations';
import { Task } from '../types/index';

const mockTasks: Task[] = [
  {
    id: 't-1',
    projectId: 'p-1',
    title: 'Design API Schema',
    description: 'REST architecture definition',
    status: 'completed',
    priority: 'high',
    assignedTo: 'u-1',
    createdBy: 'u-1',
    labels: ['backend', 'architecture'],
    dueDate: '2026-11-01T00:00:00.000Z',
    order: 0,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
  },
  {
    id: 't-2',
    projectId: 'p-1',
    title: 'Implement Kanban Board',
    description: 'Drag and drop columns with status synchronization',
    status: 'in_progress',
    priority: 'urgent',
    assignedTo: 'u-2',
    createdBy: 'u-1',
    labels: ['frontend', 'ui'],
    dueDate: '2026-11-08T00:00:00.000Z',
    order: 1,
    createdAt: '2026-10-05T00:00:00.000Z',
    updatedAt: '2026-10-06T00:00:00.000Z',
  },
  {
    id: 't-3',
    projectId: 'p-1',
    title: 'Setup MongoDB connection',
    description: 'Database models and connection pool',
    status: 'todo',
    priority: 'medium',
    assignedTo: 'u-1',
    createdBy: 'u-1',
    labels: ['database'],
    dueDate: '2026-11-20T00:00:00.000Z',
    order: 2,
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
  },
  {
    id: 't-4',
    projectId: 'p-2',
    title: 'Marketing Landing Page',
    description: 'Public showcase',
    status: 'review',
    priority: 'low',
    assignedTo: 'u-3',
    createdBy: 'u-2',
    labels: ['marketing'],
    dueDate: '2026-11-25T00:00:00.000Z',
    order: 0,
    createdAt: '2026-10-15T00:00:00.000Z',
    updatedAt: '2026-10-15T00:00:00.000Z',
  },
];

test('calculateProjectProgress returns correct percentage', () => {
  const p1Tasks = mockTasks.filter((t) => t.projectId === 'p-1');
  // 1 out of 3 is completed -> 33%
  assert.equal(calculateProjectProgress(p1Tasks), 33);
  assert.equal(calculateProjectProgress([]), 0);

  const allDone = p1Tasks.map((t) => ({ ...t, status: 'completed' as const }));
  assert.equal(calculateProjectProgress(allDone), 100);
});

test('isTaskOverdue accurately flags overdue incomplete tasks', () => {
  const refDate = new Date('2026-11-10T00:00:00.000Z');

  // t-1 is completed, so not overdue even though due date was 2026-11-01
  assert.equal(isTaskOverdue(mockTasks[0], refDate), false);

  // t-2 is in_progress and due date 2026-11-08 was before 2026-11-10 -> OVERDUE
  assert.equal(isTaskOverdue(mockTasks[1], refDate), true);

  // t-3 is todo but due 2026-11-20 is after 2026-11-10 -> NOT overdue
  assert.equal(isTaskOverdue(mockTasks[2], refDate), false);
});

test('groupTasksByStatus categorizes tasks into 4 kanban columns', () => {
  const grouped = groupTasksByStatus(mockTasks);
  assert.equal(grouped.todo.length, 1);
  assert.equal(grouped.in_progress.length, 1);
  assert.equal(grouped.review.length, 1);
  assert.equal(grouped.completed.length, 1);
  assert.equal(grouped.todo[0].id, 't-3');
});

test('filterAndSortTasks filters by search query and priority', () => {
  const searched = filterAndSortTasks(mockTasks, { search: 'Kanban' });
  assert.equal(searched.length, 1);
  assert.equal(searched[0].id, 't-2');

  const urgentTasks = filterAndSortTasks(mockTasks, { priority: 'urgent' });
  assert.equal(urgentTasks.length, 1);
  assert.equal(urgentTasks[0].id, 't-2');

  const sortedByPriority = filterAndSortTasks(mockTasks, {
    sortBy: 'priority',
    sortOrder: 'desc',
  });
  // Urgent should be first
  assert.equal(sortedByPriority[0].priority, 'urgent');
});

test('countUnreadNotifications counts only unread notifications', () => {
  const notifs = [
    { isRead: false },
    { isRead: true },
    { isRead: false },
    { isRead: false },
  ];
  assert.equal(countUnreadNotifications(notifs), 3);
  assert.equal(countUnreadNotifications([]), 0);
});

test('due-date filters support overdue, today, this week, missing dates, and custom ranges', () => {
  const tasks: Task[] = [
    { ...mockTasks[0], id: 'due-overdue', status: 'todo', dueDate: '2026-11-10T00:00:00.000Z' },
    { ...mockTasks[0], id: 'due-today', status: 'todo', dueDate: '2026-11-11T00:00:00.000Z' },
    { ...mockTasks[0], id: 'due-week', status: 'in_progress', dueDate: '2026-11-15T00:00:00.000Z' },
    { ...mockTasks[0], id: 'due-next-week', status: 'todo', dueDate: '2026-11-16T00:00:00.000Z' },
    { ...mockTasks[0], id: 'due-none', status: 'todo', dueDate: undefined },
    { ...mockTasks[0], id: 'completed-overdue', status: 'completed', dueDate: '2026-11-10T00:00:00.000Z' },
  ];
  const ids = (options: Parameters<typeof filterAndSortTasks>[1]) =>
    filterAndSortTasks(tasks, options).map((task) => task.id).sort();

  assert.deepEqual(ids({ dueDateFilter: 'overdue' }), ['due-overdue']);
  assert.deepEqual(ids({ dueDateFilter: 'today' }), ['due-today']);
  assert.deepEqual(ids({ dueDateFilter: 'this_week' }), ['completed-overdue', 'due-overdue', 'due-today', 'due-week']);
  assert.deepEqual(ids({ dueDateFilter: 'none' }), ['due-none']);
  assert.deepEqual(ids({ dueDateFilter: 'custom', dueDateFrom: '2026-11-11', dueDateTo: '2026-11-15' }), ['due-today', 'due-week']);
  assert.deepEqual(ids({ status: 'todo', priority: 'urgent', dueDateFilter: 'today' }), []);
});

test('date-only validation rejects malformed and impossible dates', () => {
  assert.equal(isValidDateOnly('2026-11-11'), true);
  assert.equal(isValidDateOnly('2026-02-30'), false);
  assert.equal(isValidDateOnly('11/11/2026'), false);
});
