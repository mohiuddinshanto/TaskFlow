import type { Project, User } from '../types/index';

export function canManageProject(project: Project | undefined, user: User | null): boolean {
  if (!project || !user) return false;
  return user.role === 'admin' || project.ownerId === user.id || project.members.some(
    (member) => member.userId === user.id && (member.role === 'owner' || member.role === 'admin'),
  );
}

export function canManageAnyProject(projects: Project[], user: User | null): boolean {
  return user?.role === 'admin' || projects.some((project) => canManageProject(project, user));
}
