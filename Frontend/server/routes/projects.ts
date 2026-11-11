import { Router, Response } from 'express';
import { database } from '../db';
import { authenticate, AuthenticatedRequest } from '../auth';
import { Project, ProjectMember, ProjectStatus } from '../../src/types/index';
import {
  canChangeProjectRoles,
  canManageProjectMembers,
  canRemoveProjectMember,
  canTransferProjectOwnership,
  prepareOwnershipTransfer,
} from '../projectPermissions';

export const projectsRouter = Router();

// GET /api/projects - list accessible projects
projectsRouter.get('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const allProjects = database.getProjects();

  if (user.role === 'admin') {
    res.json(allProjects);
    return;
  }

  // Filter projects where user is owner or member
  const accessible = allProjects.filter(
    (p) => p.ownerId === user.id || p.members.some((m) => m.userId === user.id)
  );
  res.json(accessible);
});

// GET /api/projects/:id - single project details
projectsRouter.get('/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const project = database.getProjectById(req.params.id);

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  // Check access permission
  const isAuthorized =
    user.role === 'admin' ||
    project.ownerId === user.id ||
    project.members.some((m) => m.userId === user.id);

  if (!isAuthorized) {
    res.status(403).json({ error: 'You do not have access to this project.' });
    return;
  }

  res.json(project);
});

// POST /api/projects - create new project
projectsRouter.post('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { name, description, startDate, dueDate, color, category, memberIds } = req.body;

  if (typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Project name is required.' });
    return;
  }
  if (description !== undefined && typeof description !== 'string') {
    res.status(400).json({ error: 'Project description must be text.' });
    return;
  }
  const validDate = (value: unknown) => value === undefined || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
  if (!validDate(startDate) || !validDate(dueDate)) {
    res.status(400).json({ error: 'Project dates must be valid date strings.' });
    return;
  }
  if (startDate && dueDate && Date.parse(dueDate) < Date.parse(startDate)) {
    res.status(400).json({ error: 'Project due date must be on or after its start date.' });
    return;
  }

  const now = new Date().toISOString();
  const members: ProjectMember[] = [
    { userId: user.id, role: 'owner', joinedAt: now },
  ];

  const projectId = `proj-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  if (memberIds !== undefined && !Array.isArray(memberIds)) {
    res.status(400).json({ error: 'Member IDs must be an array.' });
    return;
  }
  if (Array.isArray(memberIds)) {
    for (const mId of new Set(memberIds)) {
      if (mId !== user.id && database.getUserById(mId)) {
        members.push({ userId: mId, role: 'member' as const, joinedAt: now });
      }
    }
  }

  const newProject: Project = {
    id: projectId,
    name: name.trim(),
    description: description || '',
    ownerId: user.id,
    members,
    status: 'active',
    startDate: startDate || now,
    dueDate: dueDate || new Date(Date.now() + 14 * 86400000).toISOString(),
    color: color || '#3B82F6',
    category: category || 'General',
    createdAt: now,
    updatedAt: now,
  };

  const created = database.createProject(newProject);
  for (const member of members.filter((entry) => entry.userId !== user.id)) {
    database.createNotification({
      recipientId: member.userId,
      type: 'project_invited',
      message: `${user.name} added you to project "${created.name}"`,
      relatedProjectId: created.id,
    });
  }
  res.status(201).json(created);
});

// PATCH /api/projects/:id - update project
projectsRouter.patch('/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const project = database.getProjectById(req.params.id);

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  // Only owner or admin can edit project details
  if (user.role !== 'admin' && project.ownerId !== user.id) {
    res.status(403).json({ error: 'Only the project owner or an administrator can update this project.' });
    return;
  }

  const { name, description, startDate, dueDate, color, category, status } = req.body;
  if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
    res.status(400).json({ error: 'Project name cannot be empty.' });
    return;
  }
  if (description !== undefined && typeof description !== 'string') {
    res.status(400).json({ error: 'Project description must be text.' });
    return;
  }
  const validDate = (value: unknown) => value === undefined || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
  if (!validDate(startDate) || !validDate(dueDate)) {
    res.status(400).json({ error: 'Project dates must be valid date strings.' });
    return;
  }
  if (startDate && dueDate && Date.parse(dueDate) < Date.parse(startDate)) {
    res.status(400).json({ error: 'Project due date must be on or after its start date.' });
    return;
  }
  const projectStatuses: ProjectStatus[] = ['active', 'on_hold', 'completed'];
  if (status !== undefined && !projectStatuses.includes(status)) {
    res.status(400).json({ error: `Invalid project status. Must be one of: ${projectStatuses.join(', ')}` });
    return;
  }
  const updated = database.updateProject(
    req.params.id,
    {
      ...(name && { name: name.trim() }),
      ...(description !== undefined && { description }),
      ...(startDate && { startDate }),
      ...(dueDate && { dueDate }),
      ...(color && { color }),
      ...(category && { category }),
      ...(status && { status }),
    },
    user.id
  );

  res.json(updated);
});

// DELETE /api/projects/:id - delete project
projectsRouter.delete('/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const project = database.getProjectById(req.params.id);

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  if (user.role !== 'admin' && project.ownerId !== user.id) {
    res.status(403).json({ error: 'Only the project owner or an administrator can delete this project.' });
    return;
  }

  database.deleteProject(req.params.id, user.id);
  res.json({ message: 'Project and all associated tasks deleted successfully.' });
});

// POST /api/projects/:id/members - add member
projectsRouter.post('/:id/members', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const project = database.getProjectById(req.params.id);

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  if (!canManageProjectMembers(project, user)) {
    res.status(403).json({ error: 'Only the project owner, a project Admin, or a platform administrator can add members.' });
    return;
  }

  const { userId } = req.body;
  if (!userId || !database.getUserById(userId)) {
    res.status(400).json({ error: 'Valid user ID is required.' });
    return;
  }

  if (project.members.some((m) => m.userId === userId)) {
    res.status(400).json({ error: 'User is already a member of this project.' });
    return;
  }
  if (req.body.role !== undefined && req.body.role !== 'member') {
    res.status(400).json({ error: 'New members must be added as Member; only the Owner can change roles.' });
    return;
  }

  const updatedMembers = [
    ...project.members,
    {
      userId,
      role: 'member' as const,
      joinedAt: new Date().toISOString(),
    },
  ];

  const updated = database.updateProject(req.params.id, { members: updatedMembers }, user.id);

  database.createNotification({
    recipientId: userId,
    type: 'project_invited',
    message: `${user.name} added you to project "${project.name}"`,
    relatedProjectId: project.id,
  });

  res.json(updated);
});

// DELETE /api/projects/:id/members/:userId - remove member
projectsRouter.delete('/:id/members/:userId', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const project = database.getProjectById(req.params.id);

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  if (!canManageProjectMembers(project, user)) {
    res.status(403).json({ error: 'Only the project owner, a project Admin, or a platform administrator can remove members.' });
    return;
  }

  if (req.params.userId === project.ownerId) {
    res.status(400).json({ error: 'Cannot remove the primary project owner.' });
    return;
  }

  if (!canRemoveProjectMember(project, user, req.params.userId)) {
    res.status(403).json({ error: 'Project Admins may remove Members, but only the Owner can remove an Admin.' });
    return;
  }

  const updatedMembers = project.members.filter((m) => m.userId !== req.params.userId);
  const updated = database.updateProject(req.params.id, { members: updatedMembers }, user.id);

  res.json(updated);
});

// PATCH /api/projects/:id/members/:userId/role - owner-only role management
projectsRouter.patch('/:id/members/:userId/role', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const project = database.getProjectById(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  if (!canChangeProjectRoles(project, user)) {
    res.status(403).json({ error: 'Only the current project Owner can change member roles.' });
    return;
  }

  const { userId } = req.params;
  const { role } = req.body as { role?: unknown };
  if (userId === project.ownerId) {
    res.status(400).json({ error: 'The Owner role cannot be changed with this endpoint.' });
    return;
  }
  if (role !== 'admin' && role !== 'member') {
    res.status(400).json({ error: 'Role must be either admin or member.' });
    return;
  }
  const nextRole: ProjectMember['role'] = role === 'admin' ? 'admin' : 'member';
  const target = project.members.find((member) => member.userId === userId);
  if (!target) {
    res.status(404).json({ error: 'Project member not found.' });
    return;
  }
  if (target.role === 'owner') {
    res.status(409).json({ error: 'Project ownership data is inconsistent; use the ownership transfer endpoint.' });
    return;
  }

  const previousRole = target.role;
  const members = project.members.map((member) => member.userId === userId ? { ...member, role: nextRole } : member);
  const updated = database.updateProject(project.id, { members }, user.id);
  if (!updated) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  const targetUser = database.getUserById(userId);
  database.createNotification({
    recipientId: userId,
    type: 'project_role_changed',
    message: `${user.name} changed your role in "${project.name}" from ${previousRole} to ${nextRole}.`,
    relatedProjectId: project.id,
  });
  database.logActivity({
    userId: user.id,
    projectId: project.id,
    targetId: userId,
    targetType: 'member',
    action: 'project_member_role_changed',
    details: `Changed ${targetUser?.name || userId}'s role from ${previousRole} to ${nextRole} in "${project.name}".`,
  });
  res.json(updated);
});

// POST /api/projects/:id/transfer-ownership - transfer to an existing project member
projectsRouter.post('/:id/transfer-ownership', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const project = database.getProjectById(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  if (!canTransferProjectOwnership(project, user)) {
    res.status(403).json({ error: 'Only the current project Owner can transfer ownership.' });
    return;
  }

  const { userId } = req.body as { userId?: unknown };
  if (typeof userId !== 'string' || userId.length === 0) {
    res.status(400).json({ error: 'A project member userId is required.' });
    return;
  }
  if (userId === project.ownerId) {
    res.status(400).json({ error: 'The project is already owned by this user.' });
    return;
  }
  const targetMember = project.members.find((member) => member.userId === userId);
  if (!targetMember) {
    res.status(404).json({ error: 'Ownership can only be transferred to an existing project member.' });
    return;
  }
  const transferredProject = prepareOwnershipTransfer(project, userId);
  if (!transferredProject) {
    res.status(409).json({ error: 'Project ownership data is inconsistent; ask an administrator to repair it.' });
    return;
  }

  const updated = database.updateProject(project.id, { ownerId: transferredProject.ownerId, members: transferredProject.members }, user.id);
  if (!updated) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }

  const targetUser = database.getUserById(userId);
  database.createNotification({
    recipientId: user.id,
    type: 'ownership_transferred',
    message: `You transferred ownership of "${project.name}" to ${targetUser?.name || userId}. You are now an Admin.`,
    relatedProjectId: project.id,
  });
  database.createNotification({
    recipientId: userId,
    type: 'ownership_transferred',
    message: `${user.name} transferred ownership of "${project.name}" to you.`,
    relatedProjectId: project.id,
  });
  database.logActivity({
    userId: user.id,
    projectId: project.id,
    targetId: userId,
    targetType: 'member',
    action: 'project_ownership_transferred',
    details: `Transferred ownership of "${project.name}" to ${targetUser?.name || userId}; previous Owner is now Admin.`,
  });
  res.json(updated);
});
