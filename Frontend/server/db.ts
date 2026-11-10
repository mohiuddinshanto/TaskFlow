import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { MongoClient, Db } from 'mongodb';
import {
  User,
  Project,
  Task,
  Comment,
  Notification,
  Activity,
  UserRole,
  TaskStatus,
  TaskPriority,
} from '../src/types/index';

interface DatabaseSchema {
  schemaVersion: number;
  users: (User & { passwordHash: string })[];
  projects: Project[];
  tasks: Task[];
  comments: Comment[];
  notifications: Notification[];
  activities: Activity[];
}

const DATA_DIR = path.resolve(process.env.TASKFLOW_DATA_DIR || path.join(process.cwd(), 'data'));
const DB_FILE = path.join(DATA_DIR, 'database.json');

// In-memory cache synced to disk and MongoDB
let db: DatabaseSchema = {
  schemaVersion: 2,
  users: [],
  projects: [],
  tasks: [],
  comments: [],
  notifications: [],
  activities: [],
};

// MongoDB Native Driver connection handles
let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let isMongoConnected = false;

function ensureDirectoryExists(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function persistToDisk() {
  try {
    ensureDirectoryExists(DATA_DIR);
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('[Database] Failed to persist database to disk:', err);
  }
}

/**
 * Connect to MongoDB using the Native Driver if MONGODB_URI is provided in environment variables.
 */
export async function connectMongo(): Promise<boolean> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('[Database] MONGODB_URI not configured. Operating in high-speed persistent store mode (data/database.json).');
    return false;
  }

  try {
    console.log('[Database] Connecting to MongoDB via Native Driver...');
    mongoClient = new MongoClient(uri, {
      serverSelectionTimeoutMS: 4000,
      connectTimeoutMS: 4000,
    });
    await mongoClient.connect();
    const dbName = process.env.MONGODB_DB_NAME || 'taskflow';
    mongoDb = mongoClient.db(dbName);
    isMongoConnected = true;
    console.log(`[Database] MongoDB Native Driver successfully connected to database "${dbName}"!`);

    // Create appropriate MongoDB indexes
    try {
      await mongoDb.collection('users').createIndex({ email: 1 }, { unique: true });
      await mongoDb.collection('projects').createIndex({ ownerId: 1 });
      await mongoDb.collection('tasks').createIndex({ projectId: 1, status: 1 });
      await mongoDb.collection('tasks').createIndex({ assignedTo: 1 });
      await mongoDb.collection('comments').createIndex({ taskId: 1 });
      await mongoDb.collection('notifications').createIndex({ recipientId: 1, isRead: 1 });
    } catch (idxErr) {
      console.warn('[Database] Index verification warning:', idxErr);
    }

    // Check if remote MongoDB has data; if so, load it into cache
    const schemaMetadata = await mongoDb.collection('metadata').findOne({ id: 'taskflow' });
    const userCount = await mongoDb.collection('users').countDocuments();
    if (userCount > 0) {
      const users = await mongoDb.collection('users').find({}).toArray();
      const projects = await mongoDb.collection('projects').find({}).toArray();
      const tasks = await mongoDb.collection('tasks').find({}).toArray();
      const comments = await mongoDb.collection('comments').find({}).toArray();
      const notifications = await mongoDb.collection('notifications').find({}).toArray();
      const activities = await mongoDb.collection('activities').find({}).toArray();

      db = {
        schemaVersion: typeof schemaMetadata?.schemaVersion === 'number' ? schemaMetadata.schemaVersion : 0,
        users: users as any,
        projects: projects as any,
        tasks: tasks as any,
        comments: comments as any,
        notifications: notifications as any,
        activities: activities as any,
      };
      migrateDatabaseSchema();
      if (db.schemaVersion >= 2) {
        await Promise.all(db.users.map((user) => mongoDb!.collection('users').updateOne({ id: user.id }, { $set: user })));
        await mongoDb.collection('metadata').updateOne({ id: 'taskflow' }, { $set: { schemaVersion: 2 } }, { upsert: true });
      }
      persistToDisk();
      console.log(`[Database] Hydrated cache with ${users.length} users, ${projects.length} projects, and ${tasks.length} tasks from MongoDB.`);
    } else {
      // Sync current seed data into MongoDB
      console.log('[Database] MongoDB collections are empty. Populating with initial seed dataset...');
      if (db.users.length > 0) {
        await mongoDb.collection('users').insertMany(db.users as any);
        await mongoDb.collection('projects').insertMany(db.projects as any);
        await mongoDb.collection('tasks').insertMany(db.tasks as any);
        await mongoDb.collection('comments').insertMany(db.comments as any);
        await mongoDb.collection('notifications').insertMany(db.notifications as any);
        await mongoDb.collection('activities').insertMany(db.activities as any);
        await mongoDb.collection('metadata').updateOne({ id: 'taskflow' }, { $set: { schemaVersion: 2 } }, { upsert: true });
        console.log('[Database] Seed dataset pushed to MongoDB successfully.');
      }
    }
    return true;
  } catch (err: any) {
    console.warn('[Database] MongoDB connection attempt finished with fallback:', err.message || err);
    console.log('[Database] Active persistence: Local file engine with atomic writes.');
    isMongoConnected = false;
    return false;
  }
}

export function getDatabaseStatus() {
  return {
    isMongoConnected,
    mode: isMongoConnected ? 'MongoDB Native Driver' : 'Embedded Persistent Store',
    dataFile: DB_FILE,
    counts: {
      users: db.users.length,
      projects: db.projects.length,
      tasks: db.tasks.length,
      comments: db.comments.length,
      notifications: db.notifications.length,
      activities: db.activities.length,
    },
  };
}

export async function initDatabase(): Promise<void> {
  ensureDirectoryExists(DATA_DIR);

  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      db = JSON.parse(content);
      migrateDatabaseSchema();
      console.log('[Database] Loaded existing database records from disk:', {
        users: db.users.length,
        projects: db.projects.length,
        tasks: db.tasks.length,
      });
    } catch (err) {
      console.warn('[Database] Could not read existing database, re-seeding...', err);
      seedInitialData();
    }
  } else {
    seedInitialData();
  }

  await connectMongo();
}

export function seedInitialData() {
  const seedPassword = process.env.TASKFLOW_SEED_PASSWORD || randomBytes(32).toString('base64url');
  const defaultPasswordHash = bcrypt.hashSync(seedPassword, 10);
  const now = new Date();
  const pastDays = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
  const futureDays = (d: number) => new Date(now.getTime() + d * 86400000).toISOString();

  const users: (User & { passwordHash: string })[] = [
    {
      id: 'usr-1',
      name: 'Alex Morgan',
      email: 'alex@taskflow.dev',
      passwordHash: defaultPasswordHash,
      role: 'admin',
      jobTitle: 'Principal Engineer & Admin',
      department: 'Engineering',
      avatar: '/src/assets/images/avatar_alex_lead_1794315026659.jpg',
      createdAt: pastDays(30),
      updatedAt: pastDays(1),
    },
    {
      id: 'usr-2',
      name: 'Sarah Connor',
      email: 'sarah@taskflow.dev',
      passwordHash: defaultPasswordHash,
      role: 'project_owner',
      jobTitle: 'Staff Product Manager',
      department: 'Product',
      avatar: '/src/assets/images/avatar_sarah_pm_1794315026386.jpg',
      createdAt: pastDays(28),
      updatedAt: pastDays(2),
    },
    {
      id: 'usr-3',
      name: 'Michael Chen',
      email: 'michael@taskflow.dev',
      passwordHash: defaultPasswordHash,
      role: 'member',
      jobTitle: 'Senior Frontend Developer',
      department: 'Engineering',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      createdAt: pastDays(25),
      updatedAt: pastDays(3),
    },
    {
      id: 'usr-4',
      name: 'Elena Rostova',
      email: 'elena@taskflow.dev',
      passwordHash: defaultPasswordHash,
      role: 'member',
      jobTitle: 'UI/UX Design Lead',
      department: 'Design',
      avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
      createdAt: pastDays(20),
      updatedAt: pastDays(5),
    },
  ];

  const projects: Project[] = [
    {
      id: 'proj-1',
      name: 'TaskFlow SaaS Core Platform',
      description: 'Enterprise task orchestration engine, drag-and-drop Kanban board, real-time collaboration, and analytics reporting.',
      ownerId: 'usr-1',
      members: [
        { userId: 'usr-1', role: 'owner', joinedAt: pastDays(30) },
        { userId: 'usr-2', role: 'member', joinedAt: pastDays(28) },
        { userId: 'usr-3', role: 'member', joinedAt: pastDays(25) },
        { userId: 'usr-4', role: 'member', joinedAt: pastDays(20) },
      ],
      startDate: pastDays(30),
      dueDate: futureDays(20),
      color: '#3B82F6', // Blue
      category: 'Product Development',
      createdAt: pastDays(30),
      updatedAt: pastDays(1),
    },
    {
      id: 'proj-2',
      name: 'Mobile Touch & Responsive UX',
      description: 'Fluid viewport adaptation for tablet and mobile devices, swipe gesture cards, and responsive drawer navigation.',
      ownerId: 'usr-2',
      members: [
        { userId: 'usr-2', role: 'owner', joinedAt: pastDays(20) },
        { userId: 'usr-3', role: 'member', joinedAt: pastDays(18) },
        { userId: 'usr-4', role: 'member', joinedAt: pastDays(15) },
      ],
      startDate: pastDays(20),
      dueDate: futureDays(12),
      color: '#10B981', // Emerald
      category: 'Mobile UX',
      createdAt: pastDays(20),
      updatedAt: pastDays(2),
    },
    {
      id: 'proj-3',
      name: 'Security & Access Control Audit',
      description: 'End-to-end audit for RBAC roles, JWT session handling, rate limiting, and password hashing standard.',
      ownerId: 'usr-1',
      members: [
        { userId: 'usr-1', role: 'owner', joinedAt: pastDays(14) },
        { userId: 'usr-2', role: 'member', joinedAt: pastDays(10) },
      ],
      startDate: pastDays(14),
      dueDate: pastDays(2), // Overdue intentionally for stats demo
      color: '#F59E0B', // Amber
      category: 'Security',
      createdAt: pastDays(14),
      updatedAt: pastDays(3),
    },
  ];

  const tasks: Task[] = [
    // Project 1 Tasks
    {
      id: 'tsk-101',
      projectId: 'proj-1',
      title: 'Design interactive Kanban board columns',
      description: 'Build four Kanban columns (Todo, In Progress, Review, Completed) with responsive drop targets and visual feedback.',
      status: 'completed',
      priority: 'high',
      assignedTo: 'usr-3',
      createdBy: 'usr-1',
      labels: ['frontend', 'kanban', 'ui'],
      startDate: pastDays(15),
      dueDate: pastDays(5),
      order: 0,
      estimatedHours: 12,
      actualHours: 10,
      createdAt: pastDays(15),
      updatedAt: pastDays(5),
    },
    {
      id: 'tsk-102',
      projectId: 'proj-1',
      title: 'Build REST API endpoints for task CRUD',
      description: 'Implement Express routers for tasks with query filtering, pagination, and role-based permissions.',
      status: 'completed',
      priority: 'urgent',
      assignedTo: 'usr-1',
      createdBy: 'usr-1',
      labels: ['backend', 'api', 'express'],
      startDate: pastDays(12),
      dueDate: pastDays(3),
      order: 1,
      estimatedHours: 8,
      actualHours: 7,
      createdAt: pastDays(12),
      updatedAt: pastDays(3),
    },
    {
      id: 'tsk-103',
      projectId: 'proj-1',
      title: 'Implement drag-and-drop state synchronization',
      description: 'Update task column positions instantly in state and persist PATCH /api/tasks/:id payload to backend.',
      status: 'in_progress',
      priority: 'urgent',
      assignedTo: 'usr-3',
      createdBy: 'usr-2',
      labels: ['frontend', 'state', 'dnd'],
      startDate: pastDays(4),
      dueDate: futureDays(2),
      order: 0,
      estimatedHours: 16,
      actualHours: 8,
      createdAt: pastDays(4),
      updatedAt: pastDays(1),
    },
    {
      id: 'tsk-104',
      projectId: 'proj-1',
      title: 'Task comments and discussion thread',
      description: 'Allow team members to comment on tasks, edit comments, and view author timestamps.',
      status: 'review',
      priority: 'medium',
      assignedTo: 'usr-4',
      createdBy: 'usr-1',
      labels: ['collaboration', 'comments'],
      startDate: pastDays(6),
      dueDate: futureDays(4),
      order: 0,
      estimatedHours: 10,
      actualHours: 9,
      createdAt: pastDays(6),
      updatedAt: pastDays(1),
    },
    {
      id: 'tsk-105',
      projectId: 'proj-1',
      title: 'In-app notification system with badge count',
      description: 'Notify users when tasks are assigned, deadlines approach, or comments are created.',
      status: 'todo',
      priority: 'high',
      assignedTo: 'usr-1',
      createdBy: 'usr-2',
      labels: ['notifications', 'backend'],
      startDate: pastDays(2),
      dueDate: futureDays(6),
      order: 0,
      estimatedHours: 14,
      createdAt: pastDays(2),
      updatedAt: pastDays(2),
    },
    {
      id: 'tsk-106',
      projectId: 'proj-1',
      title: 'Full dashboard analytics and metrics cards',
      description: 'Display completion statistics, overdue counts, upcoming deadlines, and activity logs.',
      status: 'in_progress',
      priority: 'high',
      assignedTo: 'usr-3',
      createdBy: 'usr-1',
      labels: ['dashboard', 'analytics'],
      startDate: pastDays(3),
      dueDate: futureDays(5),
      order: 1,
      estimatedHours: 12,
      actualHours: 6,
      createdAt: pastDays(3),
      updatedAt: pastDays(1),
    },
    {
      id: 'tsk-107',
      projectId: 'proj-1',
      title: 'Implement Dark / Light mode with zero contrast flaws',
      description: 'Ensure all cards, modals, and typography adhere to Tailwind v4 custom dark variant.',
      status: 'completed',
      priority: 'medium',
      assignedTo: 'usr-4',
      createdBy: 'usr-3',
      labels: ['theme', 'css', 'design'],
      startDate: pastDays(8),
      dueDate: pastDays(2),
      order: 2,
      estimatedHours: 6,
      actualHours: 5,
      createdAt: pastDays(8),
      updatedAt: pastDays(2),
    },

    // Project 2 Tasks
    {
      id: 'tsk-201',
      projectId: 'proj-2',
      title: 'Design mobile navigation drawer and bottom bar',
      description: 'Create responsive header and sidebar toggle for screens under 768px width.',
      status: 'in_progress',
      priority: 'high',
      assignedTo: 'usr-4',
      createdBy: 'usr-2',
      labels: ['mobile', 'responsive'],
      startDate: pastDays(5),
      dueDate: futureDays(3),
      order: 0,
      estimatedHours: 8,
      createdAt: pastDays(5),
      updatedAt: pastDays(1),
    },
    {
      id: 'tsk-202',
      projectId: 'proj-2',
      title: 'Test touch swipe gestures on Kanban columns',
      description: 'Provide horizontal scroll snap and tap-to-move dropdown for mobile devices.',
      status: 'todo',
      priority: 'medium',
      assignedTo: 'usr-3',
      createdBy: 'usr-2',
      labels: ['mobile', 'touch'],
      startDate: pastDays(2),
      dueDate: futureDays(8),
      order: 0,
      estimatedHours: 10,
      createdAt: pastDays(2),
      updatedAt: pastDays(2),
    },

    // Project 3 Tasks (Overdue item for testing stats)
    {
      id: 'tsk-301',
      projectId: 'proj-3',
      title: 'Verify JWT expiration and refresh logic',
      description: 'Validate token lifespans and ensure secure cookie storage with SameSite flags.',
      status: 'todo',
      priority: 'urgent',
      assignedTo: 'usr-1',
      createdBy: 'usr-1',
      labels: ['security', 'auth'],
      startDate: pastDays(10),
      dueDate: pastDays(1), // Overdue
      order: 0,
      estimatedHours: 6,
      createdAt: pastDays(10),
      updatedAt: pastDays(1),
    },
  ];

  const comments: Comment[] = [
    {
      id: 'com-1',
      taskId: 'tsk-103',
      authorId: 'usr-1',
      content: 'I verified the drag-and-drop backend route. The order and status attributes are correctly updated on PATCH.',
      createdAt: pastDays(2),
      updatedAt: pastDays(2),
    },
    {
      id: 'com-2',
      taskId: 'tsk-103',
      authorId: 'usr-3',
      content: 'Awesome! Adding smooth CSS transition cards so moving tasks feels snappy and responsive.',
      createdAt: pastDays(1),
      updatedAt: pastDays(1),
    },
    {
      id: 'com-3',
      taskId: 'tsk-104',
      authorId: 'usr-2',
      content: 'Make sure comment deletion is restricted to either the original author or workspace admins.',
      createdAt: pastDays(3),
      updatedAt: pastDays(3),
    },
  ];

  const notifications: Notification[] = [
    {
      id: 'notif-1',
      recipientId: 'usr-1',
      type: 'task_assigned',
      message: 'You have been assigned to "In-app notification system with badge count"',
      relatedProjectId: 'proj-1',
      relatedTaskId: 'tsk-105',
      isRead: false,
      createdAt: pastDays(1),
    },
    {
      id: 'notif-2',
      recipientId: 'usr-1',
      type: 'deadline_approaching',
      message: 'Task "Verify JWT expiration and refresh logic" is past its scheduled deadline.',
      relatedProjectId: 'proj-3',
      relatedTaskId: 'tsk-301',
      isRead: false,
      createdAt: pastDays(1),
    },
    {
      id: 'notif-3',
      recipientId: 'usr-1',
      type: 'comment_added',
      message: 'Michael Chen commented on "Implement drag-and-drop state synchronization"',
      relatedProjectId: 'proj-1',
      relatedTaskId: 'tsk-103',
      isRead: true,
      createdAt: pastDays(2),
    },
    {
      id: 'notif-4',
      recipientId: 'usr-2',
      type: 'project_invited',
      message: 'You were added as Project Owner to "Mobile Touch & Responsive UX"',
      relatedProjectId: 'proj-2',
      isRead: false,
      createdAt: pastDays(5),
    },
  ];

  const activities: Activity[] = [
    {
      id: 'act-1',
      userId: 'usr-1',
      projectId: 'proj-1',
      taskId: 'tsk-102',
      action: 'completed_task',
      details: 'Completed task "Build REST API endpoints for task CRUD"',
      createdAt: pastDays(3),
    },
    {
      id: 'act-2',
      userId: 'usr-3',
      projectId: 'proj-1',
      taskId: 'tsk-103',
      action: 'status_changed',
      details: 'Moved task "Implement drag-and-drop state synchronization" to In Progress',
      createdAt: pastDays(2),
    },
    {
      id: 'act-3',
      userId: 'usr-4',
      projectId: 'proj-1',
      taskId: 'tsk-107',
      action: 'completed_task',
      details: 'Completed task "Implement Dark / Light mode with zero contrast flaws"',
      createdAt: pastDays(2),
    },
    {
      id: 'act-4',
      userId: 'usr-1',
      projectId: 'proj-1',
      action: 'created_project',
      details: 'Created project "TaskFlow SaaS Core Platform"',
      createdAt: pastDays(30),
    },
  ];

  db = {
    schemaVersion: 2,
    users,
    projects,
    tasks,
    comments,
    notifications,
    activities,
  };

  persistToDisk();
  console.log('[Database] Database initialized with seed data successfully.');
}

/** Remove the historically published demo password from persisted seed accounts. */
function migrateDatabaseSchema() {
  if (Number.isInteger(db.schemaVersion) && db.schemaVersion >= 2) return;
  const legacyAccounts = db.users.filter((u) => ['alex@taskflow.dev', 'sarah@taskflow.dev', 'michael@taskflow.dev', 'elena@taskflow.dev'].includes(u.email));
  for (const user of legacyAccounts) {
    const replacementPassword = process.env.TASKFLOW_SEED_PASSWORD || randomBytes(32).toString('base64url');
    user.passwordHash = bcrypt.hashSync(replacementPassword, 10);
  }
  db.schemaVersion = 2;
  persistToDisk();
}

// Database query helpers
export const database = {
  // Users
  getUsers: () => db.users,
  getUserById: (id: string) => db.users.find((u) => u.id === id),
  getUserByEmail: (email: string) =>
    db.users.find((u) => u.email.toLowerCase() === email.toLowerCase()),
  createUser: (user: User & { passwordHash: string }) => {
    db.users.push(user);
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection('users').insertOne({ ...user }).catch(console.error);
    }
    return user;
  },
  updateUser: (id: string, updates: Partial<User & { passwordHash?: string }>) => {
    const index = db.users.findIndex((u) => u.id === id);
    if (index === -1) return null;
    db.users[index] = { ...db.users[index], ...updates, updatedAt: new Date().toISOString() };
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection('users').updateOne({ id }, { $set: db.users[index] }).catch(console.error);
    }
    return db.users[index];
  },

  // Projects
  getProjects: () => db.projects,
  getProjectById: (id: string) => db.projects.find((p) => p.id === id),
  createProject: (project: Project) => {
    db.projects.push(project);
    database.logActivity({
      userId: project.ownerId,
      projectId: project.id,
      action: 'created_project',
      details: `Created project "${project.name}"`,
    });
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection('projects').insertOne({ ...project }).catch(console.error);
    }
    return project;
  },
  updateProject: (id: string, updates: Partial<Project>, actorId?: string) => {
    const index = db.projects.findIndex((p) => p.id === id);
    if (index === -1) return null;
    db.projects[index] = { ...db.projects[index], ...updates, updatedAt: new Date().toISOString() };
    if (actorId) {
      database.logActivity({
        userId: actorId,
        projectId: id,
        action: 'updated_project',
        details: `Updated project "${db.projects[index].name}"`,
      });
    }
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection('projects').updateOne({ id }, { $set: db.projects[index] }).catch(console.error);
    }
    return db.projects[index];
  },
  deleteProject: (id: string, actorId?: string) => {
    const proj = db.projects.find((p) => p.id === id);
    if (!proj) return false;
    db.projects = db.projects.filter((p) => p.id !== id);
    // Delete associated tasks and comments
    const taskIds = db.tasks.filter((t) => t.projectId === id).map((t) => t.id);
    db.tasks = db.tasks.filter((t) => t.projectId !== id);
    db.comments = db.comments.filter((c) => !taskIds.includes(c.taskId));
    db.notifications = db.notifications.filter((n) => n.relatedProjectId !== id && !taskIds.includes(n.relatedTaskId || ''));
    db.activities = db.activities.filter((a) => a.projectId !== id);
    if (actorId) {
      database.logActivity({
        userId: actorId,
        action: 'deleted_project',
        details: `Deleted project "${proj.name}"`,
      });
    }
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection('projects').deleteOne({ id }).catch(console.error);
      mongoDb.collection('tasks').deleteMany({ projectId: id }).catch(console.error);
      mongoDb.collection('comments').deleteMany({ taskId: { $in: taskIds } }).catch(console.error);
      mongoDb.collection('notifications').deleteMany({ $or: [{ relatedProjectId: id }, { relatedTaskId: { $in: taskIds } }] }).catch(console.error);
      mongoDb.collection('activities').deleteMany({ projectId: id }).catch(console.error);
    }
    return true;
  },

  // Tasks
  getTasks: (projectId?: string) => {
    if (projectId) return db.tasks.filter((t) => t.projectId === projectId);
    return db.tasks;
  },
  getTaskById: (id: string) => db.tasks.find((t) => t.id === id),
  createTask: (task: Task, actorId: string) => {
    db.tasks.push(task);
    database.logActivity({
      userId: actorId,
      projectId: task.projectId,
      taskId: task.id,
      action: 'created_task',
      details: `Created task "${task.title}"`,
    });
    // Create notification if assigned
    if (task.assignedTo && task.assignedTo !== actorId) {
      database.createNotification({
        recipientId: task.assignedTo,
        type: 'task_assigned',
        message: `You were assigned to "${task.title}"`,
        relatedProjectId: task.projectId,
        relatedTaskId: task.id,
      });
    }
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection('tasks').insertOne({ ...task }).catch(console.error);
    }
    return task;
  },
  updateTask: (id: string, updates: Partial<Task>, actorId: string) => {
    const index = db.tasks.findIndex((t) => t.id === id);
    if (index === -1) return null;
    const old = db.tasks[index];
    db.tasks[index] = { ...old, ...updates, updatedAt: new Date().toISOString() };

    // Check status change
    if (updates.status && updates.status !== old.status) {
      database.logActivity({
        userId: actorId,
        projectId: old.projectId,
        taskId: id,
        action: 'status_changed',
        details: `Moved "${old.title}" from ${old.status} to ${updates.status}`,
      });
      if (old.assignedTo && old.assignedTo !== actorId) {
        database.createNotification({
          recipientId: old.assignedTo,
          type: 'status_changed',
          message: `Task "${old.title}" moved to ${updates.status.replace('_', ' ')}`,
          relatedProjectId: old.projectId,
          relatedTaskId: id,
        });
      }
    }

    // Check assignee change
    if (updates.assignedTo && updates.assignedTo !== old.assignedTo && updates.assignedTo !== actorId) {
      database.createNotification({
        recipientId: updates.assignedTo,
        type: 'task_assigned',
        message: `You were assigned to "${old.title}"`,
        relatedProjectId: old.projectId,
        relatedTaskId: id,
      });
    }

    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection('tasks').updateOne({ id }, { $set: db.tasks[index] }).catch(console.error);
    }
    return db.tasks[index];
  },
  deleteTask: (id: string, actorId: string) => {
    const task = db.tasks.find((t) => t.id === id);
    if (!task) return false;
    db.tasks = db.tasks.filter((t) => t.id !== id);
    db.comments = db.comments.filter((c) => c.taskId !== id);
    db.notifications = db.notifications.filter((n) => n.relatedTaskId !== id);
    db.activities = db.activities.filter((a) => a.taskId !== id);
    database.logActivity({
      userId: actorId,
      projectId: task.projectId,
      action: 'deleted_task',
      details: `Deleted task "${task.title}"`,
    });
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection('tasks').deleteOne({ id }).catch(console.error);
      mongoDb.collection('comments').deleteMany({ taskId: id }).catch(console.error);
      mongoDb.collection('notifications').deleteMany({ relatedTaskId: id }).catch(console.error);
      mongoDb.collection('activities').deleteMany({ taskId: id }).catch(console.error);
    }
    return true;
  },

  // Comments
  getCommentsByTask: (taskId: string) => db.comments.filter((c) => c.taskId === taskId),
  createComment: (comment: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newComment: Comment = {
      ...comment,
      id: `com-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.comments.push(newComment);

    const task = db.tasks.find((t) => t.id === comment.taskId);
    if (task && task.assignedTo && task.assignedTo !== comment.authorId) {
      database.createNotification({
        recipientId: task.assignedTo,
        type: 'comment_added',
        message: `New comment on "${task.title}"`,
        relatedProjectId: task.projectId,
        relatedTaskId: task.id,
      });
    }
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection('comments').insertOne({ ...newComment }).catch(console.error);
    }
    return newComment;
  },
  updateComment: (id: string, content: string, authorId: string) => {
    const index = db.comments.findIndex((c) => c.id === id);
    if (index === -1) return null;
    if (db.comments[index].authorId !== authorId) return null; // Only author can edit
    db.comments[index].content = content;
    db.comments[index].updatedAt = new Date().toISOString();
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection('comments').updateOne({ id }, { $set: db.comments[index] }).catch(console.error);
    }
    return db.comments[index];
  },
  deleteComment: (id: string, userId: string, isAdmin: boolean) => {
    const comment = db.comments.find((c) => c.id === id);
    if (!comment) return false;
    if (comment.authorId !== userId && !isAdmin) return false;
    db.comments = db.comments.filter((c) => c.id !== id);
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection('comments').deleteOne({ id }).catch(console.error);
    }
    return true;
  },

  // Notifications
  getNotifications: (recipientId: string) =>
    db.notifications
      .filter((n) => n.recipientId === recipientId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  createNotification: (notif: Omit<Notification, 'id' | 'isRead' | 'createdAt'>) => {
    const newNotif: Notification = {
      ...notif,
      id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    db.notifications.push(newNotif);
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection('notifications').insertOne({ ...newNotif }).catch(console.error);
    }
    return newNotif;
  },
  markNotificationRead: (id: string, recipientId: string) => {
    const notif = db.notifications.find((n) => n.id === id && n.recipientId === recipientId);
    if (!notif) return null;
    notif.isRead = true;
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection('notifications').updateOne({ id }, { $set: { isRead: true } }).catch(console.error);
    }
    return notif;
  },
  markAllNotificationsRead: (recipientId: string) => {
    for (const notif of db.notifications) {
      if (notif.recipientId === recipientId) {
        notif.isRead = true;
      }
    }
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection('notifications').updateMany({ recipientId }, { $set: { isRead: true } }).catch(console.error);
    }
    return true;
  },

  // Activities
  getActivities: (limit = 20) =>
    [...db.activities]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit),
  logActivity: (act: Omit<Activity, 'id' | 'createdAt'>) => {
    const newAct: Activity = {
      ...act,
      id: `act-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString(),
    };
    db.activities.push(newAct);
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection('activities').insertOne({ ...newAct }).catch(console.error);
    }
    return newAct;
  },
};
