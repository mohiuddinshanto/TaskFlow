import test from 'node:test';
import assert from 'node:assert/strict';
import type { Project, Task, User } from '../src/types/index';
import { database } from './db';
import { tasksRouter } from './routes/tasks';
import {
  canDeleteTask,
  canChangeProjectRoles,
  canEditTask,
  canManageProjectMembers,
  canManageTask,
  canRemoveProjectMember,
  canTransferProjectOwnership,
  prepareOwnershipTransfer,
  getProjectMemberRole,
  hasProjectAccess,
  getForbiddenTaskEditFields,
} from './projectPermissions';

const owner: User = { id: 'owner', name: 'Owner', email: 'owner@test.local', role: 'member', createdAt: '', updatedAt: '' };
const admin: User = { id: 'admin', name: 'Admin', email: 'admin@test.local', role: 'member', createdAt: '', updatedAt: '' };
const member: User = { id: 'member', name: 'Member', email: 'member@test.local', role: 'member', createdAt: '', updatedAt: '' };
const outsider: User = { id: 'outsider', name: 'Outsider', email: 'outsider@test.local', role: 'member', createdAt: '', updatedAt: '' };
const platformAdmin: User = { id: 'platform-admin', name: 'Platform Admin', email: 'root@test.local', role: 'admin', createdAt: '', updatedAt: '' };

const project: Project = {
  id: 'project-1',
  name: 'AUDIT_TEST_RBAC',
  description: '',
  ownerId: owner.id,
  members: [
    { userId: owner.id, role: 'owner', joinedAt: '' },
    { userId: admin.id, role: 'admin', joinedAt: '' },
    { userId: member.id, role: 'member', joinedAt: '' },
  ],
  startDate: '',
  dueDate: '',
  createdAt: '',
  updatedAt: '',
};

const task: Task = {
  id: 'task-1', projectId: project.id, title: 'AUDIT_TEST_Task', description: '', status: 'todo',
  priority: 'medium', createdBy: member.id, labels: [], order: 0, createdAt: '', updatedAt: '',
};

test('project role access and membership management matrix', () => {
  assert.equal(getProjectMemberRole(project, owner.id), 'owner');
  assert.equal(getProjectMemberRole(project, admin.id), 'admin');
  assert.equal(getProjectMemberRole(project, member.id), 'member');
  assert.equal(hasProjectAccess(project, outsider), false);
  assert.equal(hasProjectAccess(project, platformAdmin), true);
  assert.equal(canManageProjectMembers(project, admin), true);
  assert.equal(canManageProjectMembers(project, member), false);
  assert.equal(canChangeProjectRoles(project, owner), true);
  assert.equal(canChangeProjectRoles(project, admin), false);
  assert.equal(canChangeProjectRoles(project, member), false);
  assert.equal(canChangeProjectRoles(project, outsider), false);
  assert.equal(canTransferProjectOwnership(project, owner), true);
  assert.equal(canTransferProjectOwnership(project, admin), false);
  assert.equal(canTransferProjectOwnership(project, member), false);
  assert.equal(canRemoveProjectMember(project, admin, member.id), true);
  assert.equal(canRemoveProjectMember(project, admin, owner.id), false);
  assert.equal(canRemoveProjectMember(project, admin, admin.id), false);
});

test('project Admin can manage task fields but Owner alone controls project and role changes', () => {
  assert.equal(canManageTask(project, admin), true);
  assert.equal(canEditTask(project, task, admin), true);
  assert.equal(canDeleteTask(project, task, admin), false);
  assert.equal(canDeleteTask(project, task, owner), true);
  assert.equal(canDeleteTask(project, task, member), true);
  assert.equal(canDeleteTask(project, task, platformAdmin), true);
});

test('plain project members cannot submit full-edit task fields', () => {
  assert.deepEqual(getForbiddenTaskEditFields({ priority: 'urgent' }, false), ['priority']);
  assert.deepEqual(getForbiddenTaskEditFields({ status: 'review', order: 2 }, false), []);
  assert.deepEqual(getForbiddenTaskEditFields({ title: 'change', status: 'review' }, false), ['title']);
  assert.deepEqual(getForbiddenTaskEditFields({ priority: 'urgent' }, true), []);
});

test('PATCH /api/tasks/:id rejects a plain member editing a full-edit field', () => {
  const projectId = 'rbac-patch-project';
  const taskId = 'rbac-patch-task';
  database.createProject({
    ...project,
    id: projectId,
    members: [
      { userId: owner.id, role: 'owner', joinedAt: '' },
      { userId: member.id, role: 'member', joinedAt: '' },
    ],
  });
  database.createTask({ ...task, id: taskId, projectId, createdBy: owner.id }, owner.id);

  const layer = tasksRouter.stack.find((entry) => entry.route?.path === '/:id' &&
    (entry.route as unknown as { methods: Record<string, boolean> }).methods.patch);
  assert.ok(layer?.route);
  const patchHandler = layer.route.stack[1].handle as (req: unknown, res: unknown) => void;
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };

  patchHandler(
    { user: member, params: { id: taskId }, body: { priority: 'urgent' } },
    response,
  );

  assert.equal(response.statusCode, 403);
  assert.deepEqual((response.body as { fields: string[] }).fields, ['priority']);
  assert.equal(database.getTaskById(taskId)?.priority, 'medium');
});

test('ownership transfer preserves exactly one owner and demotes the previous owner', () => {
  const transferred = prepareOwnershipTransfer(project, admin.id);
  assert.ok(transferred);
  assert.equal(transferred.ownerId, admin.id);
  assert.equal(transferred.members.filter((entry) => entry.role === 'owner').length, 1);
  assert.equal(getProjectMemberRole(transferred, owner.id), 'admin');
  assert.equal(getProjectMemberRole(transferred, admin.id), 'owner');
  assert.equal(prepareOwnershipTransfer(project, outsider.id), null);
  assert.equal(prepareOwnershipTransfer(project, owner.id), null);
  assert.equal(prepareOwnershipTransfer({ ...project, members: project.members.filter((entry) => entry.userId !== owner.id) }, admin.id), null);
});
