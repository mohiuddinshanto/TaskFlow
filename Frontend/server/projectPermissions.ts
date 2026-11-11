import type { Project, Task, User } from '../src/types/index';

export type ProjectMemberRole = 'owner' | 'admin' | 'member';

export function getProjectMemberRole(project: Project, userId: string): ProjectMemberRole | undefined {
  if (project.ownerId === userId) return 'owner';
  return project.members.find((member) => member.userId === userId)?.role;
}

export function hasProjectAccess(project: Project, user: Pick<User, 'id' | 'role'>): boolean {
  return user.role === 'admin' || getProjectMemberRole(project, user.id) !== undefined;
}

export function canManageProjectMembers(project: Project, user: Pick<User, 'id' | 'role'>): boolean {
  return user.role === 'admin' || getProjectMemberRole(project, user.id) === 'owner' ||
    getProjectMemberRole(project, user.id) === 'admin';
}

export function canChangeProjectRoles(project: Project, user: Pick<User, 'id'>): boolean {
  return project.ownerId === user.id;
}

export function canTransferProjectOwnership(project: Project, user: Pick<User, 'id'>): boolean {
  return project.ownerId === user.id;
}

export function prepareOwnershipTransfer(project: Project, targetUserId: string): Project | null {
  const owners = project.members.filter((member) => member.role === 'owner');
  if (owners.length !== 1 || owners[0]?.userId !== project.ownerId) return null;
  if (targetUserId === project.ownerId || project.members.filter((member) => member.userId === targetUserId).length !== 1) return null;

  return {
    ...project,
    ownerId: targetUserId,
    members: project.members.map((member) => {
      if (member.userId === project.ownerId) return { ...member, role: 'admin' };
      if (member.userId === targetUserId) return { ...member, role: 'owner' };
      return member;
    }),
  };
}

export function canRemoveProjectMember(
  project: Project,
  user: Pick<User, 'id' | 'role'>,
  targetUserId: string,
): boolean {
  if (targetUserId === project.ownerId) return false;
  if (user.role === 'admin' || project.ownerId === user.id) return true;
  return getProjectMemberRole(project, user.id) === 'admin' &&
    getProjectMemberRole(project, targetUserId) === 'member';
}

export function canManageTask(project: Project, user: Pick<User, 'id' | 'role'>): boolean {
  return user.role === 'admin' || getProjectMemberRole(project, user.id) === 'owner' ||
    getProjectMemberRole(project, user.id) === 'admin';
}

export function canEditTask(
  project: Project,
  task: Task,
  user: Pick<User, 'id' | 'role'>,
): boolean {
  return canManageTask(project, user) || task.createdBy === user.id || task.assignedTo === user.id;
}

const FULL_TASK_EDIT_FIELDS = new Set([
  'title',
  'description',
  'priority',
  'assignedTo',
  'labels',
  'startDate',
  'dueDate',
  'estimatedHours',
  'actualHours',
]);

export function getForbiddenTaskEditFields(
  updates: Record<string, unknown>,
  canFullEdit: boolean,
): string[] {
  if (canFullEdit) return [];
  return Object.keys(updates).filter((field) => FULL_TASK_EDIT_FIELDS.has(field));
}

export function canDeleteTask(
  project: Project,
  task: Task,
  user: Pick<User, 'id' | 'role'>,
): boolean {
  return user.role === 'admin' || project.ownerId === user.id || task.createdBy === user.id;
}
