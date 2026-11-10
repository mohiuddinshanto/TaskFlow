import { Router, Response } from 'express';
import { database } from '../db';
import { authenticate, AuthenticatedRequest } from '../auth';
import { Project, ProjectMember, ProjectStatus } from '../../src/types/index';

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

  if (user.role !== 'admin' && project.ownerId !== user.id) {
    res.status(403).json({ error: 'Only the project owner or an administrator can add members.' });
    return;
  }

  const { userId, role } = req.body;
  if (!userId || !database.getUserById(userId)) {
    res.status(400).json({ error: 'Valid user ID is required.' });
    return;
  }

  if (project.members.some((m) => m.userId === userId)) {
    res.status(400).json({ error: 'User is already a member of this project.' });
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

  if (user.role !== 'admin' && project.ownerId !== user.id) {
    res.status(403).json({ error: 'Only the project owner or an administrator can remove members.' });
    return;
  }

  if (req.params.userId === project.ownerId) {
    res.status(400).json({ error: 'Cannot remove the primary project owner.' });
    return;
  }

  const updatedMembers = project.members.filter((m) => m.userId !== req.params.userId);
  const updated = database.updateProject(req.params.id, { members: updatedMembers }, user.id);

  res.json(updated);
});
