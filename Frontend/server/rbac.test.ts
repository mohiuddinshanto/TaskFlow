import test from 'node:test';
import assert from 'node:assert/strict';

interface Project {
  id: string;
  name: string;
  ownerId: string;
  members: Array<{ userId: string; role: 'owner' | 'admin' | 'member' }>;
}

function checkProjectAccess(
  userId: string,
  userRole: string,
  project: Project
): { hasAccess: boolean; isOwner: boolean } {
  if (userRole === 'admin') return { hasAccess: true, isOwner: true };
  const isOwner = project.ownerId === userId;
  const isMember =
    isOwner ||
    (Array.isArray(project.members) &&
      project.members.some((m) => m.userId === userId));
  return { hasAccess: isMember, isOwner };
}

function canDeleteTask(
  userId: string,
  userRole: string,
  task: { createdBy: string },
  project: Project
): boolean {
  if (userRole === 'admin') return true;
  if (task.createdBy === userId) return true;
  if (project.ownerId === userId) return true;
  return false;
}

const mockProject: Project = {
  id: 'proj-101',
  name: 'Security Audit App',
  ownerId: 'user-owner',
  members: [
    { userId: 'user-owner', role: 'owner' },
    { userId: 'user-member-1', role: 'member' },
  ],
};

test('RBAC: Admin has universal access and owner permissions', () => {
  const result = checkProjectAccess('user-admin', 'admin', mockProject);
  assert.equal(result.hasAccess, true);
  assert.equal(result.isOwner, true);
});

test('RBAC: Project owner has full access and owner permissions', () => {
  const result = checkProjectAccess('user-owner', 'member', mockProject);
  assert.equal(result.hasAccess, true);
  assert.equal(result.isOwner, true);
});

test('RBAC: Project member has access but not owner permissions', () => {
  const result = checkProjectAccess('user-member-1', 'member', mockProject);
  assert.equal(result.hasAccess, true);
  assert.equal(result.isOwner, false);
});

test('RBAC: Outsider is strictly denied access', () => {
  const result = checkProjectAccess('user-stranger', 'member', mockProject);
  assert.equal(result.hasAccess, false);
  assert.equal(result.isOwner, false);
});

test('RBAC: Task deletion rights are restricted to creator, owner, or admin', () => {
  const task = { createdBy: 'user-member-1' };

  // Task creator can delete
  assert.equal(canDeleteTask('user-member-1', 'member', task, mockProject), true);
  // Project owner can delete
  assert.equal(canDeleteTask('user-owner', 'member', task, mockProject), true);
  // System admin can delete
  assert.equal(canDeleteTask('user-admin', 'admin', task, mockProject), true);
  // Other member cannot delete someone else's task
  assert.equal(canDeleteTask('user-other', 'member', task, mockProject), false);
});
