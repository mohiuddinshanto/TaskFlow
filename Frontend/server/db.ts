import 'dotenv/config';
import { MongoClient, Db, Document, WithId } from 'mongodb';
import {
  User,
  Project,
  Task,
  Comment,
  Notification,
  Activity,
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

function stripMongoIds<T extends Document>(documents: WithId<T>[]): T[] {
  return documents.map(({ _id: _mongoId, ...document }) => document as unknown as T);
}

// In-memory cache hydrated from MongoDB. MongoDB is the sole persistent store.
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
const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB_NAME;
let mongoClient: MongoClient | null = mongoUri
  && process.env.TASKFLOW_DISABLE_MONGODB !== 'true'
  ? new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 })
  : null;
let mongoDb: Db | null = null;
let isMongoConnected = false;
let mongoConnectPromise: Promise<void> | null = null;
const pendingMongoWrites: Promise<unknown>[] = [];

function persistMongoWrite(write: Promise<unknown>) {
  pendingMongoWrites.push(write);
  void write.catch(() => {});
}

export async function flushMongoWrites(): Promise<void> {
  while (pendingMongoWrites.length > 0) {
    const writes = pendingMongoWrites.splice(0);
    const results = await Promise.allSettled(writes);
    if (results.some((result) => result.status === 'rejected')) {
      throw new Error('MongoDB write failed.');
    }
  }
}

/**
 * Connect to the required MongoDB Native Driver store.
 */
export async function connectMongo(): Promise<boolean> {
  if (process.env.TASKFLOW_DISABLE_MONGODB === 'true') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MongoDB cannot be disabled in production.');
    }
    console.log('[Database] MongoDB disabled for this run (isolated development/test mode).');
    return false;
  }
  if (!mongoUri) {
    throw new Error('MONGODB_URI is required. TaskFlow stores application data in MongoDB.');
  }
  if (!mongoDbName) throw new Error('MONGODB_DB_NAME is required. Set the intended TaskFlow database name.');

  try {
    console.log('[Database] Connecting to MongoDB via Native Driver...');
    mongoConnectPromise ??= mongoClient!.connect().then(() => undefined);
    await mongoConnectPromise;
    mongoDb = mongoClient!.db(mongoDbName);
    await mongoDb.command({ ping: 1 });
    isMongoConnected = true;
    console.log(`[Database] MongoDB Native Driver connected to database "${mongoDbName}".`);

    // Create appropriate MongoDB indexes
    try {
      await mongoDb.collection('users').createIndex({ email: 1 }, { unique: true });
      await mongoDb.collection('projects').createIndex({ ownerId: 1 });
      await mongoDb.collection('tasks').createIndex({ projectId: 1, status: 1 });
      await mongoDb.collection('tasks').createIndex({ assignedTo: 1 });
      await mongoDb.collection('comments').createIndex({ taskId: 1 });
      await mongoDb.collection('notifications').createIndex({ recipientId: 1, isRead: 1 });
    } catch (idxErr) {
      const indexError = idxErr as { name?: string; code?: string | number; message?: string };
      const indexMessage = (indexError.message || '').replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, 'mongodb://[REDACTED]');
      console.warn('[Database] Index verification warning:', {
        name: indexError.name || 'Error', code: indexError.code || 'unknown', message: indexMessage.slice(0, 200),
      });
    }

    // Hydrate the in-memory cache from MongoDB. New databases start empty.
    const schemaMetadata = await mongoDb.collection('metadata').findOne({ id: 'taskflow' });
    const [users, projects, tasks, comments, notifications, activities] = await Promise.all([
      mongoDb.collection<DatabaseSchema['users'][number] & Document>('users').find({}).toArray(),
      mongoDb.collection<Project & Document>('projects').find({}).toArray(),
      mongoDb.collection<Task & Document>('tasks').find({}).toArray(),
      mongoDb.collection<Comment & Document>('comments').find({}).toArray(),
      mongoDb.collection<Notification & Document>('notifications').find({}).toArray(),
      mongoDb.collection<Activity & Document>('activities').find({}).toArray(),
    ]).then(([u, p, t, c, n, a]) => [stripMongoIds(u), stripMongoIds(p), stripMongoIds(t), stripMongoIds(c), stripMongoIds(n), stripMongoIds(a)] as const);
    db = {
      schemaVersion: typeof schemaMetadata?.schemaVersion === 'number' ? schemaMetadata.schemaVersion : 2,
      users,
      projects,
      tasks,
      comments,
      notifications,
      activities,
    };
      if (db.schemaVersion >= 2) {
        await Promise.all(db.users.map((user) => mongoDb!.collection('users').updateOne({ id: user.id }, { $set: user })));
      }
    await mongoDb.collection('metadata').updateOne({ id: 'taskflow' }, { $set: { schemaVersion: 2 } }, { upsert: true });
    console.log(`[Database] Hydrated cache with ${users.length} users, ${projects.length} projects, and ${tasks.length} tasks from MongoDB.`);
    return true;
  } catch (err: unknown) {
    const error = err as { name?: string; code?: string | number; message?: string };
    const message = (error.message || '').replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, 'mongodb://[REDACTED]');
    console.error('[Database] MongoDB connection failed; refusing to start with local fallback:', {
      name: error.name || 'Error', code: error.code || 'unknown', message: message.slice(0, 300),
    });
    isMongoConnected = false;
    throw new Error(`MongoDB connection failed (${error.name || 'Error'}; code ${error.code || 'unknown'}). Check Atlas network access, DNS, TLS, and authentication. ${message.slice(0, 200)}`);
  }
}

export function getDatabaseStatus() {
  return {
    isMongoConnected,
    mode: isMongoConnected ? 'MongoDB Native Driver' : 'MongoDB disabled (isolated test mode)',
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
  db = { schemaVersion: 2, users: [], projects: [], tasks: [], comments: [], notifications: [], activities: [] };
  await connectMongo();
}

export function getMongoClient(): MongoClient | null { return mongoClient; }

export async function closeMongo(): Promise<void> {
  if (mongoClient) await mongoClient.close();
  mongoDb = null;
  isMongoConnected = false;
  mongoConnectPromise = null;
}

export const database = {
  // Users
  getUsers: () => db.users,
  getUserById: (id: string) => db.users.find((u) => u.id === id),
  getUserByEmail: (email: string) =>
    db.users.find((u) => u.email.toLowerCase() === email.toLowerCase()),
  createUser: async (user: User & { passwordHash: string }) => {
    db.users.push(user);
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection('users').insertOne({ ...user }));
    }
    await flushMongoWrites();
    return user;
  },
  updateUser: (id: string, updates: Partial<User & { passwordHash?: string }>) => {
    const index = db.users.findIndex((u) => u.id === id);
    if (index === -1) return null;
    db.users[index] = { ...db.users[index], ...updates, updatedAt: new Date().toISOString() };
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection('users').updateOne({ id }, { $set: db.users[index] }));
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
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection('projects').insertOne({ ...project }));
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
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection('projects').updateOne({ id }, { $set: db.projects[index] }));
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
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection('projects').deleteOne({ id }));
      persistMongoWrite(mongoDb.collection('tasks').deleteMany({ projectId: id }));
      persistMongoWrite(mongoDb.collection('comments').deleteMany({ taskId: { $in: taskIds } }));
      persistMongoWrite(mongoDb.collection('notifications').deleteMany({ $or: [{ relatedProjectId: id }, { relatedTaskId: { $in: taskIds } }] }));
      persistMongoWrite(mongoDb.collection('activities').deleteMany({ projectId: id }));
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
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection('tasks').insertOne({ ...task }));
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

    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection('tasks').updateOne({ id }, { $set: db.tasks[index] }));
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
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection('tasks').deleteOne({ id }));
      persistMongoWrite(mongoDb.collection('comments').deleteMany({ taskId: id }));
      persistMongoWrite(mongoDb.collection('notifications').deleteMany({ relatedTaskId: id }));
      persistMongoWrite(mongoDb.collection('activities').deleteMany({ taskId: id }));
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
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection('comments').insertOne({ ...newComment }));
    }
    return newComment;
  },
  updateComment: (id: string, content: string, authorId: string) => {
    const index = db.comments.findIndex((c) => c.id === id);
    if (index === -1) return null;
    if (db.comments[index].authorId !== authorId) return null; // Only author can edit
    db.comments[index].content = content;
    db.comments[index].updatedAt = new Date().toISOString();
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection('comments').updateOne({ id }, { $set: db.comments[index] }));
    }
    return db.comments[index];
  },
  deleteComment: (id: string, userId: string, isAdmin: boolean) => {
    const comment = db.comments.find((c) => c.id === id);
    if (!comment) return false;
    if (comment.authorId !== userId && !isAdmin) return false;
    db.comments = db.comments.filter((c) => c.id !== id);
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection('comments').deleteOne({ id }));
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
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection('notifications').insertOne({ ...newNotif }));
    }
    return newNotif;
  },
  markNotificationRead: (id: string, recipientId: string) => {
    const notif = db.notifications.find((n) => n.id === id && n.recipientId === recipientId);
    if (!notif) return null;
    notif.isRead = true;
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection('notifications').updateOne({ id }, { $set: { isRead: true } }));
    }
    return notif;
  },
  markAllNotificationsRead: (recipientId: string) => {
    for (const notif of db.notifications) {
      if (notif.recipientId === recipientId) {
        notif.isRead = true;
      }
    }
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection('notifications').updateMany({ recipientId }, { $set: { isRead: true } }));
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
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection('activities').insertOne({ ...newAct }));
    }
    return newAct;
  },
};
