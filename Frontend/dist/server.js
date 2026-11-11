// server.ts
import "dotenv/config";
import express from "express";
import path from "path";
import cookieParser from "cookie-parser";

// server/db.ts
import "dotenv/config";
import { MongoClient } from "mongodb";
function stripMongoIds(documents) {
  return documents.map(({ _id: _mongoId, ...document }) => document);
}
var db = {
  schemaVersion: 2,
  users: [],
  projects: [],
  tasks: [],
  comments: [],
  notifications: [],
  activities: []
};
var mongoUri = process.env.MONGODB_URI;
var mongoDbName = process.env.MONGODB_DB_NAME;
var mongoClient = mongoUri && process.env.TASKFLOW_DISABLE_MONGODB !== "true" ? new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5e3, connectTimeoutMS: 5e3 }) : null;
var mongoDb = null;
var isMongoConnected = false;
var mongoConnectPromise = null;
var pendingMongoWrites = [];
function persistMongoWrite(write) {
  pendingMongoWrites.push(write);
  void write.catch(() => {
  });
}
async function flushMongoWrites() {
  while (pendingMongoWrites.length > 0) {
    const writes = pendingMongoWrites.splice(0);
    const results = await Promise.allSettled(writes);
    if (results.some((result) => result.status === "rejected")) {
      throw new Error("MongoDB write failed.");
    }
  }
}
async function connectMongo() {
  if (process.env.TASKFLOW_DISABLE_MONGODB === "true") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("MongoDB cannot be disabled in production.");
    }
    console.log("[Database] MongoDB disabled for this run (isolated development/test mode).");
    return false;
  }
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required. TaskFlow stores application data in MongoDB.");
  }
  if (!mongoDbName) throw new Error("MONGODB_DB_NAME is required. Set the intended TaskFlow database name.");
  try {
    console.log("[Database] Connecting to MongoDB via Native Driver...");
    mongoConnectPromise ??= mongoClient.connect().then(() => void 0);
    await mongoConnectPromise;
    mongoDb = mongoClient.db(mongoDbName);
    await mongoDb.command({ ping: 1 });
    isMongoConnected = true;
    console.log(`[Database] MongoDB Native Driver connected to database "${mongoDbName}".`);
    try {
      await mongoDb.collection("users").createIndex({ email: 1 }, { unique: true });
      await mongoDb.collection("projects").createIndex({ ownerId: 1 });
      await mongoDb.collection("tasks").createIndex({ projectId: 1, status: 1 });
      await mongoDb.collection("tasks").createIndex({ assignedTo: 1 });
      await mongoDb.collection("comments").createIndex({ taskId: 1 });
      await mongoDb.collection("notifications").createIndex({ recipientId: 1, isRead: 1 });
    } catch (idxErr) {
      const indexError = idxErr;
      const indexMessage = (indexError.message || "").replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "mongodb://[REDACTED]");
      console.warn("[Database] Index verification warning:", {
        name: indexError.name || "Error",
        code: indexError.code || "unknown",
        message: indexMessage.slice(0, 200)
      });
    }
    const schemaMetadata = await mongoDb.collection("metadata").findOne({ id: "taskflow" });
    const [users, projects, tasks, comments, notifications, activities] = await Promise.all([
      mongoDb.collection("users").find({}).toArray(),
      mongoDb.collection("projects").find({}).toArray(),
      mongoDb.collection("tasks").find({}).toArray(),
      mongoDb.collection("comments").find({}).toArray(),
      mongoDb.collection("notifications").find({}).toArray(),
      mongoDb.collection("activities").find({}).toArray()
    ]).then(([u, p, t, c, n, a]) => [stripMongoIds(u), stripMongoIds(p), stripMongoIds(t), stripMongoIds(c), stripMongoIds(n), stripMongoIds(a)]);
    db = {
      schemaVersion: typeof schemaMetadata?.schemaVersion === "number" ? schemaMetadata.schemaVersion : 2,
      users,
      projects,
      tasks,
      comments,
      notifications,
      activities
    };
    if (db.schemaVersion >= 2) {
      await Promise.all(db.users.map((user) => mongoDb.collection("users").updateOne({ id: user.id }, { $set: user })));
    }
    await mongoDb.collection("metadata").updateOne({ id: "taskflow" }, { $set: { schemaVersion: 2 } }, { upsert: true });
    console.log(`[Database] Hydrated cache with ${users.length} users, ${projects.length} projects, and ${tasks.length} tasks from MongoDB.`);
    return true;
  } catch (err) {
    const error = err;
    const message = (error.message || "").replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "mongodb://[REDACTED]");
    console.error("[Database] MongoDB connection failed; refusing to start with local fallback:", {
      name: error.name || "Error",
      code: error.code || "unknown",
      message: message.slice(0, 300)
    });
    isMongoConnected = false;
    throw new Error(`MongoDB connection failed (${error.name || "Error"}; code ${error.code || "unknown"}). Check Atlas network access, DNS, TLS, and authentication. ${message.slice(0, 200)}`);
  }
}
function getDatabaseStatus() {
  return {
    isMongoConnected,
    mode: isMongoConnected ? "MongoDB Native Driver" : "MongoDB disabled (isolated test mode)",
    counts: {
      users: db.users.length,
      projects: db.projects.length,
      tasks: db.tasks.length,
      comments: db.comments.length,
      notifications: db.notifications.length,
      activities: db.activities.length
    }
  };
}
async function initDatabase() {
  db = { schemaVersion: 2, users: [], projects: [], tasks: [], comments: [], notifications: [], activities: [] };
  await connectMongo();
}
function getMongoClient() {
  return mongoClient;
}
async function closeMongo() {
  if (mongoClient) await mongoClient.close();
  mongoDb = null;
  isMongoConnected = false;
  mongoConnectPromise = null;
}
var database = {
  // Users
  getUsers: () => db.users,
  getUserById: (id) => db.users.find((u) => u.id === id),
  getUserByEmail: (email) => db.users.find((u) => u.email.toLowerCase() === email.toLowerCase()),
  createUser: async (user) => {
    db.users.push(user);
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection("users").insertOne({ ...user }));
    }
    await flushMongoWrites();
    return user;
  },
  updateUser: (id, updates) => {
    const index = db.users.findIndex((u) => u.id === id);
    if (index === -1) return null;
    db.users[index] = { ...db.users[index], ...updates, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection("users").updateOne({ id }, { $set: db.users[index] }));
    }
    return db.users[index];
  },
  // Projects
  getProjects: () => db.projects,
  getProjectById: (id) => db.projects.find((p) => p.id === id),
  createProject: (project) => {
    db.projects.push(project);
    database.logActivity({
      userId: project.ownerId,
      projectId: project.id,
      action: "created_project",
      details: `Created project "${project.name}"`
    });
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection("projects").insertOne({ ...project }));
    }
    return project;
  },
  updateProject: (id, updates, actorId) => {
    const index = db.projects.findIndex((p) => p.id === id);
    if (index === -1) return null;
    db.projects[index] = { ...db.projects[index], ...updates, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    if (actorId) {
      database.logActivity({
        userId: actorId,
        projectId: id,
        action: "updated_project",
        details: `Updated project "${db.projects[index].name}"`
      });
    }
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection("projects").updateOne({ id }, { $set: db.projects[index] }));
    }
    return db.projects[index];
  },
  deleteProject: (id, actorId) => {
    const proj = db.projects.find((p) => p.id === id);
    if (!proj) return false;
    db.projects = db.projects.filter((p) => p.id !== id);
    const taskIds = db.tasks.filter((t) => t.projectId === id).map((t) => t.id);
    db.tasks = db.tasks.filter((t) => t.projectId !== id);
    db.comments = db.comments.filter((c) => !taskIds.includes(c.taskId));
    db.notifications = db.notifications.filter((n) => n.relatedProjectId !== id && !taskIds.includes(n.relatedTaskId || ""));
    db.activities = db.activities.filter((a) => a.projectId !== id);
    if (actorId) {
      database.logActivity({
        userId: actorId,
        action: "deleted_project",
        details: `Deleted project "${proj.name}"`
      });
    }
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection("projects").deleteOne({ id }));
      persistMongoWrite(mongoDb.collection("tasks").deleteMany({ projectId: id }));
      persistMongoWrite(mongoDb.collection("comments").deleteMany({ taskId: { $in: taskIds } }));
      persistMongoWrite(mongoDb.collection("notifications").deleteMany({ $or: [{ relatedProjectId: id }, { relatedTaskId: { $in: taskIds } }] }));
      persistMongoWrite(mongoDb.collection("activities").deleteMany({ projectId: id }));
    }
    return true;
  },
  // Tasks
  getTasks: (projectId) => {
    if (projectId) return db.tasks.filter((t) => t.projectId === projectId);
    return db.tasks;
  },
  getTaskById: (id) => db.tasks.find((t) => t.id === id),
  createTask: (task, actorId) => {
    db.tasks.push(task);
    database.logActivity({
      userId: actorId,
      projectId: task.projectId,
      taskId: task.id,
      action: "created_task",
      details: `Created task "${task.title}"`
    });
    if (task.assignedTo && task.assignedTo !== actorId) {
      database.createNotification({
        recipientId: task.assignedTo,
        type: "task_assigned",
        message: `You were assigned to "${task.title}"`,
        relatedProjectId: task.projectId,
        relatedTaskId: task.id
      });
    }
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection("tasks").insertOne({ ...task }));
    }
    return task;
  },
  updateTask: (id, updates, actorId) => {
    const index = db.tasks.findIndex((t) => t.id === id);
    if (index === -1) return null;
    const old = db.tasks[index];
    db.tasks[index] = { ...old, ...updates, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    if (updates.status && updates.status !== old.status) {
      database.logActivity({
        userId: actorId,
        projectId: old.projectId,
        taskId: id,
        action: "status_changed",
        details: `Moved "${old.title}" from ${old.status} to ${updates.status}`
      });
      if (old.assignedTo && old.assignedTo !== actorId) {
        database.createNotification({
          recipientId: old.assignedTo,
          type: "status_changed",
          message: `Task "${old.title}" moved to ${updates.status.replace("_", " ")}`,
          relatedProjectId: old.projectId,
          relatedTaskId: id
        });
      }
    }
    if (updates.assignedTo && updates.assignedTo !== old.assignedTo && updates.assignedTo !== actorId) {
      database.createNotification({
        recipientId: updates.assignedTo,
        type: "task_assigned",
        message: `You were assigned to "${old.title}"`,
        relatedProjectId: old.projectId,
        relatedTaskId: id
      });
    }
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection("tasks").updateOne({ id }, { $set: db.tasks[index] }));
    }
    return db.tasks[index];
  },
  deleteTask: (id, actorId) => {
    const task = db.tasks.find((t) => t.id === id);
    if (!task) return false;
    db.tasks = db.tasks.filter((t) => t.id !== id);
    db.comments = db.comments.filter((c) => c.taskId !== id);
    db.notifications = db.notifications.filter((n) => n.relatedTaskId !== id);
    db.activities = db.activities.filter((a) => a.taskId !== id);
    database.logActivity({
      userId: actorId,
      projectId: task.projectId,
      action: "deleted_task",
      details: `Deleted task "${task.title}"`
    });
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection("tasks").deleteOne({ id }));
      persistMongoWrite(mongoDb.collection("comments").deleteMany({ taskId: id }));
      persistMongoWrite(mongoDb.collection("notifications").deleteMany({ relatedTaskId: id }));
      persistMongoWrite(mongoDb.collection("activities").deleteMany({ taskId: id }));
    }
    return true;
  },
  // Comments
  getCommentsByTask: (taskId) => db.comments.filter((c) => c.taskId === taskId),
  createComment: (comment) => {
    const newComment = {
      ...comment,
      id: `com-${Date.now()}-${Math.floor(Math.random() * 1e3)}`,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    db.comments.push(newComment);
    const task = db.tasks.find((t) => t.id === comment.taskId);
    if (task && task.assignedTo && task.assignedTo !== comment.authorId) {
      database.createNotification({
        recipientId: task.assignedTo,
        type: "comment_added",
        message: `New comment on "${task.title}"`,
        relatedProjectId: task.projectId,
        relatedTaskId: task.id
      });
    }
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection("comments").insertOne({ ...newComment }));
    }
    return newComment;
  },
  updateComment: (id, content, authorId) => {
    const index = db.comments.findIndex((c) => c.id === id);
    if (index === -1) return null;
    if (db.comments[index].authorId !== authorId) return null;
    db.comments[index].content = content;
    db.comments[index].updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection("comments").updateOne({ id }, { $set: db.comments[index] }));
    }
    return db.comments[index];
  },
  deleteComment: (id, userId, isAdmin) => {
    const comment = db.comments.find((c) => c.id === id);
    if (!comment) return false;
    if (comment.authorId !== userId && !isAdmin) return false;
    db.comments = db.comments.filter((c) => c.id !== id);
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection("comments").deleteOne({ id }));
    }
    return true;
  },
  // Notifications
  getNotifications: (recipientId) => db.notifications.filter((n) => n.recipientId === recipientId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  createNotification: (notif) => {
    const newNotif = {
      ...notif,
      id: `notif-${Date.now()}-${Math.floor(Math.random() * 1e3)}`,
      isRead: false,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    db.notifications.push(newNotif);
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection("notifications").insertOne({ ...newNotif }));
    }
    return newNotif;
  },
  markNotificationRead: (id, recipientId) => {
    const notif = db.notifications.find((n) => n.id === id && n.recipientId === recipientId);
    if (!notif) return null;
    notif.isRead = true;
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection("notifications").updateOne({ id }, { $set: { isRead: true } }));
    }
    return notif;
  },
  markAllNotificationsRead: (recipientId) => {
    for (const notif of db.notifications) {
      if (notif.recipientId === recipientId) {
        notif.isRead = true;
      }
    }
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection("notifications").updateMany({ recipientId }, { $set: { isRead: true } }));
    }
    return true;
  },
  // Activities
  getActivities: (limit = 20) => [...db.activities].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit),
  logActivity: (act) => {
    const newAct = {
      ...act,
      id: `act-${Date.now()}-${Math.floor(Math.random() * 1e3)}`,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    db.activities.push(newAct);
    if (isMongoConnected && mongoDb) {
      persistMongoWrite(mongoDb.collection("activities").insertOne({ ...newAct }));
    }
    return newAct;
  }
};

// server/routes/auth.ts
import { Router } from "express";

// server/auth.ts
import { fromNodeHeaders } from "better-auth/node";

// src/lib/auth.ts
import "dotenv/config";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { randomBytes } from "node:crypto";
var client = getMongoClient();
var dbName = process.env.MONGODB_DB_NAME;
var db2 = client?.db(dbName);
if (!process.env.BETTER_AUTH_SECRET && !process.env.AUTH_SECRET) {
  throw new Error("Set BETTER_AUTH_SECRET (or AUTH_SECRET) in the environment before starting the server.");
}
var auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || 3e3}`,
  database: db2 && client ? mongodbAdapter(db2, process.env.MONGODB_REPLICA_SET === "true" ? { client } : {}) : void 0,
  emailAndPassword: { enabled: true },
  advanced: { database: { joins: true } },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const existing = database.getUserById(user.id) || database.getUserByEmail(user.email);
          if (!existing) {
            await database.createUser({
              id: user.id,
              name: user.name,
              email: user.email,
              role: "member",
              jobTitle: "Team Member",
              department: "Operations",
              avatar: user.image || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}`,
              createdAt: user.createdAt.toISOString(),
              updatedAt: user.updatedAt.toISOString(),
              passwordHash: randomBytes(32).toString("hex")
            });
          } else if (existing.name !== user.name || existing.id !== user.id) {
            database.updateUser(existing.id, { name: user.name });
          }
        }
      }
    }
  }
});
async function connectAuthMongo() {
  if (!client) return;
  if (!dbName) throw new Error("MONGODB_DB_NAME is required for authentication storage.");
}

// server/auth.ts
async function authenticate(req, res, next) {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session?.user) {
      res.status(401).json({ error: "Authentication required. Please sign in." });
      return;
    }
    const storedUser = database.getUserById(session.user.id) || database.getUserByEmail(session.user.email);
    req.user = storedUser ? (({ passwordHash: _passwordHash, ...safeUser }) => safeUser)(storedUser) : {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      avatar: session.user.image || void 0,
      role: "member",
      jobTitle: "Team Member",
      department: "Operations",
      createdAt: session.user.createdAt.toISOString(),
      updatedAt: session.user.updatedAt.toISOString()
    };
    next();
  } catch (error) {
    next(error);
  }
}

// server/routes/auth.ts
import { fromNodeHeaders as fromNodeHeaders2 } from "better-auth/node";
var authRouter = Router();
authRouter.get("/me", authenticate, (req, res) => {
  res.json(req.user);
});
authRouter.get("/users", authenticate, (_req, res) => {
  const users = database.getUsers().map((u) => {
    const { passwordHash, ...safe } = u;
    return safe;
  });
  res.json(users);
});
authRouter.patch("/profile", authenticate, (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { name, jobTitle, department, avatar } = req.body;
  const updates = {};
  if (name && typeof name === "string") updates.name = name.trim();
  if (jobTitle && typeof jobTitle === "string") updates.jobTitle = jobTitle.trim();
  if (department && typeof department === "string") updates.department = department.trim();
  if (avatar && typeof avatar === "string") updates.avatar = avatar.trim();
  const updated = database.updateUser(req.user.id, updates);
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const { passwordHash: _, ...safeUser } = updated;
  res.json(safeUser);
});
authRouter.patch("/password", authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || newPassword.length < 8) {
    res.status(400).json({ error: "Current password and a new password of at least 8 characters are required." });
    return;
  }
  try {
    const result = await auth.api.changePassword({
      headers: fromNodeHeaders2(req.headers),
      body: { currentPassword, newPassword }
    });
    res.json({ message: "Password updated successfully.", ...result });
  } catch {
    res.status(400).json({ error: "Could not change password. Check your current password and try again." });
  }
});

// server/routes/projects.ts
import { Router as Router2 } from "express";

// server/projectPermissions.ts
function getProjectMemberRole(project, userId) {
  if (project.ownerId === userId) return "owner";
  return project.members.find((member) => member.userId === userId)?.role;
}
function hasProjectAccess(project, user) {
  return user.role === "admin" || getProjectMemberRole(project, user.id) !== void 0;
}
function canManageProjectMembers(project, user) {
  return user.role === "admin" || getProjectMemberRole(project, user.id) === "owner" || getProjectMemberRole(project, user.id) === "admin";
}
function canChangeProjectRoles(project, user) {
  return project.ownerId === user.id;
}
function canTransferProjectOwnership(project, user) {
  return project.ownerId === user.id;
}
function prepareOwnershipTransfer(project, targetUserId) {
  const owners = project.members.filter((member) => member.role === "owner");
  if (owners.length !== 1 || owners[0]?.userId !== project.ownerId) return null;
  if (targetUserId === project.ownerId || project.members.filter((member) => member.userId === targetUserId).length !== 1) return null;
  return {
    ...project,
    ownerId: targetUserId,
    members: project.members.map((member) => {
      if (member.userId === project.ownerId) return { ...member, role: "admin" };
      if (member.userId === targetUserId) return { ...member, role: "owner" };
      return member;
    })
  };
}
function canRemoveProjectMember(project, user, targetUserId) {
  if (targetUserId === project.ownerId) return false;
  if (user.role === "admin" || project.ownerId === user.id) return true;
  return getProjectMemberRole(project, user.id) === "admin" && getProjectMemberRole(project, targetUserId) === "member";
}
function canManageTask(project, user) {
  return user.role === "admin" || getProjectMemberRole(project, user.id) === "owner" || getProjectMemberRole(project, user.id) === "admin";
}
function canEditTask(project, task, user) {
  return canManageTask(project, user) || task.createdBy === user.id || task.assignedTo === user.id;
}
var FULL_TASK_EDIT_FIELDS = /* @__PURE__ */ new Set([
  "title",
  "description",
  "priority",
  "assignedTo",
  "labels",
  "startDate",
  "dueDate",
  "estimatedHours",
  "actualHours"
]);
function getForbiddenTaskEditFields(updates, canFullEdit) {
  if (canFullEdit) return [];
  return Object.keys(updates).filter((field) => FULL_TASK_EDIT_FIELDS.has(field));
}
function canDeleteTask(project, task, user) {
  return user.role === "admin" || project.ownerId === user.id || task.createdBy === user.id;
}

// server/routes/projects.ts
var projectsRouter = Router2();
projectsRouter.get("/", authenticate, (req, res) => {
  const user = req.user;
  const allProjects = database.getProjects();
  if (user.role === "admin") {
    res.json(allProjects);
    return;
  }
  const accessible = allProjects.filter(
    (p) => p.ownerId === user.id || p.members.some((m) => m.userId === user.id)
  );
  res.json(accessible);
});
projectsRouter.get("/:id", authenticate, (req, res) => {
  const user = req.user;
  const project = database.getProjectById(req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const isAuthorized = user.role === "admin" || project.ownerId === user.id || project.members.some((m) => m.userId === user.id);
  if (!isAuthorized) {
    res.status(403).json({ error: "You do not have access to this project." });
    return;
  }
  res.json(project);
});
projectsRouter.post("/", authenticate, (req, res) => {
  const user = req.user;
  const { name, description, startDate, dueDate, color, category, memberIds } = req.body;
  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "Project name is required." });
    return;
  }
  if (description !== void 0 && typeof description !== "string") {
    res.status(400).json({ error: "Project description must be text." });
    return;
  }
  const validDate = (value) => value === void 0 || typeof value === "string" && Number.isFinite(Date.parse(value));
  if (!validDate(startDate) || !validDate(dueDate)) {
    res.status(400).json({ error: "Project dates must be valid date strings." });
    return;
  }
  if (startDate && dueDate && Date.parse(dueDate) < Date.parse(startDate)) {
    res.status(400).json({ error: "Project due date must be on or after its start date." });
    return;
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const members = [
    { userId: user.id, role: "owner", joinedAt: now }
  ];
  const projectId = `proj-${Date.now()}-${Math.floor(Math.random() * 1e3)}`;
  if (memberIds !== void 0 && !Array.isArray(memberIds)) {
    res.status(400).json({ error: "Member IDs must be an array." });
    return;
  }
  if (Array.isArray(memberIds)) {
    for (const mId of new Set(memberIds)) {
      if (mId !== user.id && database.getUserById(mId)) {
        members.push({ userId: mId, role: "member", joinedAt: now });
      }
    }
  }
  const newProject = {
    id: projectId,
    name: name.trim(),
    description: description || "",
    ownerId: user.id,
    members,
    status: "active",
    startDate: startDate || now,
    dueDate: dueDate || new Date(Date.now() + 14 * 864e5).toISOString(),
    color: color || "#3B82F6",
    category: category || "General",
    createdAt: now,
    updatedAt: now
  };
  const created = database.createProject(newProject);
  for (const member of members.filter((entry) => entry.userId !== user.id)) {
    database.createNotification({
      recipientId: member.userId,
      type: "project_invited",
      message: `${user.name} added you to project "${created.name}"`,
      relatedProjectId: created.id
    });
  }
  res.status(201).json(created);
});
projectsRouter.patch("/:id", authenticate, (req, res) => {
  const user = req.user;
  const project = database.getProjectById(req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (user.role !== "admin" && project.ownerId !== user.id) {
    res.status(403).json({ error: "Only the project owner or an administrator can update this project." });
    return;
  }
  const { name, description, startDate, dueDate, color, category, status } = req.body;
  if (name !== void 0 && (typeof name !== "string" || name.trim().length === 0)) {
    res.status(400).json({ error: "Project name cannot be empty." });
    return;
  }
  if (description !== void 0 && typeof description !== "string") {
    res.status(400).json({ error: "Project description must be text." });
    return;
  }
  const validDate = (value) => value === void 0 || typeof value === "string" && Number.isFinite(Date.parse(value));
  if (!validDate(startDate) || !validDate(dueDate)) {
    res.status(400).json({ error: "Project dates must be valid date strings." });
    return;
  }
  if (startDate && dueDate && Date.parse(dueDate) < Date.parse(startDate)) {
    res.status(400).json({ error: "Project due date must be on or after its start date." });
    return;
  }
  const projectStatuses = ["active", "on_hold", "completed"];
  if (status !== void 0 && !projectStatuses.includes(status)) {
    res.status(400).json({ error: `Invalid project status. Must be one of: ${projectStatuses.join(", ")}` });
    return;
  }
  const updated = database.updateProject(
    req.params.id,
    {
      ...name && { name: name.trim() },
      ...description !== void 0 && { description },
      ...startDate && { startDate },
      ...dueDate && { dueDate },
      ...color && { color },
      ...category && { category },
      ...status && { status }
    },
    user.id
  );
  res.json(updated);
});
projectsRouter.delete("/:id", authenticate, (req, res) => {
  const user = req.user;
  const project = database.getProjectById(req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (user.role !== "admin" && project.ownerId !== user.id) {
    res.status(403).json({ error: "Only the project owner or an administrator can delete this project." });
    return;
  }
  database.deleteProject(req.params.id, user.id);
  res.json({ message: "Project and all associated tasks deleted successfully." });
});
projectsRouter.post("/:id/members", authenticate, (req, res) => {
  const user = req.user;
  const project = database.getProjectById(req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!canManageProjectMembers(project, user)) {
    res.status(403).json({ error: "Only the project owner, a project Admin, or a platform administrator can add members." });
    return;
  }
  const { userId } = req.body;
  if (!userId || !database.getUserById(userId)) {
    res.status(400).json({ error: "Valid user ID is required." });
    return;
  }
  if (project.members.some((m) => m.userId === userId)) {
    res.status(400).json({ error: "User is already a member of this project." });
    return;
  }
  if (req.body.role !== void 0 && req.body.role !== "member") {
    res.status(400).json({ error: "New members must be added as Member; only the Owner can change roles." });
    return;
  }
  const updatedMembers = [
    ...project.members,
    {
      userId,
      role: "member",
      joinedAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  ];
  const updated = database.updateProject(req.params.id, { members: updatedMembers }, user.id);
  database.createNotification({
    recipientId: userId,
    type: "project_invited",
    message: `${user.name} added you to project "${project.name}"`,
    relatedProjectId: project.id
  });
  res.json(updated);
});
projectsRouter.delete("/:id/members/:userId", authenticate, (req, res) => {
  const user = req.user;
  const project = database.getProjectById(req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!canManageProjectMembers(project, user)) {
    res.status(403).json({ error: "Only the project owner, a project Admin, or a platform administrator can remove members." });
    return;
  }
  if (req.params.userId === project.ownerId) {
    res.status(400).json({ error: "Cannot remove the primary project owner." });
    return;
  }
  if (!canRemoveProjectMember(project, user, req.params.userId)) {
    res.status(403).json({ error: "Project Admins may remove Members, but only the Owner can remove an Admin." });
    return;
  }
  const updatedMembers = project.members.filter((m) => m.userId !== req.params.userId);
  const updated = database.updateProject(req.params.id, { members: updatedMembers }, user.id);
  res.json(updated);
});
projectsRouter.patch("/:id/members/:userId/role", authenticate, (req, res) => {
  const user = req.user;
  const project = database.getProjectById(req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (!canChangeProjectRoles(project, user)) {
    res.status(403).json({ error: "Only the current project Owner can change member roles." });
    return;
  }
  const { userId } = req.params;
  const { role } = req.body;
  if (userId === project.ownerId) {
    res.status(400).json({ error: "The Owner role cannot be changed with this endpoint." });
    return;
  }
  if (role !== "admin" && role !== "member") {
    res.status(400).json({ error: "Role must be either admin or member." });
    return;
  }
  const nextRole = role === "admin" ? "admin" : "member";
  const target = project.members.find((member) => member.userId === userId);
  if (!target) {
    res.status(404).json({ error: "Project member not found." });
    return;
  }
  if (target.role === "owner") {
    res.status(409).json({ error: "Project ownership data is inconsistent; use the ownership transfer endpoint." });
    return;
  }
  const previousRole = target.role;
  const members = project.members.map((member) => member.userId === userId ? { ...member, role: nextRole } : member);
  const updated = database.updateProject(project.id, { members }, user.id);
  if (!updated) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  const targetUser = database.getUserById(userId);
  database.createNotification({
    recipientId: userId,
    type: "project_role_changed",
    message: `${user.name} changed your role in "${project.name}" from ${previousRole} to ${nextRole}.`,
    relatedProjectId: project.id
  });
  database.logActivity({
    userId: user.id,
    projectId: project.id,
    targetId: userId,
    targetType: "member",
    action: "project_member_role_changed",
    details: `Changed ${targetUser?.name || userId}'s role from ${previousRole} to ${nextRole} in "${project.name}".`
  });
  res.json(updated);
});
projectsRouter.post("/:id/transfer-ownership", authenticate, (req, res) => {
  const user = req.user;
  const project = database.getProjectById(req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (!canTransferProjectOwnership(project, user)) {
    res.status(403).json({ error: "Only the current project Owner can transfer ownership." });
    return;
  }
  const { userId } = req.body;
  if (typeof userId !== "string" || userId.length === 0) {
    res.status(400).json({ error: "A project member userId is required." });
    return;
  }
  if (userId === project.ownerId) {
    res.status(400).json({ error: "The project is already owned by this user." });
    return;
  }
  const targetMember = project.members.find((member) => member.userId === userId);
  if (!targetMember) {
    res.status(404).json({ error: "Ownership can only be transferred to an existing project member." });
    return;
  }
  const transferredProject = prepareOwnershipTransfer(project, userId);
  if (!transferredProject) {
    res.status(409).json({ error: "Project ownership data is inconsistent; ask an administrator to repair it." });
    return;
  }
  const updated = database.updateProject(project.id, { ownerId: transferredProject.ownerId, members: transferredProject.members }, user.id);
  if (!updated) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  const targetUser = database.getUserById(userId);
  database.createNotification({
    recipientId: user.id,
    type: "ownership_transferred",
    message: `You transferred ownership of "${project.name}" to ${targetUser?.name || userId}. You are now an Admin.`,
    relatedProjectId: project.id
  });
  database.createNotification({
    recipientId: userId,
    type: "ownership_transferred",
    message: `${user.name} transferred ownership of "${project.name}" to you.`,
    relatedProjectId: project.id
  });
  database.logActivity({
    userId: user.id,
    projectId: project.id,
    targetId: userId,
    targetType: "member",
    action: "project_ownership_transferred",
    details: `Transferred ownership of "${project.name}" to ${targetUser?.name || userId}; previous Owner is now Admin.`
  });
  res.json(updated);
});

// server/routes/tasks.ts
import { Router as Router3 } from "express";

// src/utils/taskCalculations.ts
function isTaskOverdue(task, referenceDate = /* @__PURE__ */ new Date()) {
  if (!task.dueDate || task.status === "completed") return false;
  const due = new Date(task.dueDate);
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const currentDay = Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate());
  return dueDay < currentDay;
}
function isValidDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = /* @__PURE__ */ new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function dueDateKey(value) {
  if (!value) return void 0;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : void 0;
}
function matchesDueDateFilter(task, filter, from, to, referenceDate = /* @__PURE__ */ new Date()) {
  if (filter === "none") return !task.dueDate;
  if (!task.dueDate) return false;
  if (filter === "overdue") return isTaskOverdue(task, referenceDate);
  const due = dueDateKey(task.dueDate);
  if (!due) return false;
  const today = referenceDate.toISOString().slice(0, 10);
  if (filter === "today") return due === today;
  if (filter === "this_week") {
    const day = referenceDate.getUTCDay();
    const mondayOffset = (day + 6) % 7;
    const monday = new Date(Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate() - mondayOffset
    )).toISOString().slice(0, 10);
    const sunday = new Date(Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate() - mondayOffset + 6
    )).toISOString().slice(0, 10);
    return due >= monday && due <= sunday;
  }
  return (!from || due >= from) && (!to || due <= to);
}
var PRIORITY_WEIGHTS = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1
};
function filterAndSortTasks(tasks, options) {
  let result = [...tasks];
  if (options.projectId) {
    result = result.filter((t) => t.projectId === options.projectId);
  }
  if (options.search && options.search.trim().length > 0) {
    const query = options.search.toLowerCase().trim();
    result = result.filter(
      (t) => t.title.toLowerCase().includes(query) || t.description && t.description.toLowerCase().includes(query) || t.labels.some((l) => l.toLowerCase().includes(query))
    );
  }
  if (options.status && options.status !== "all") {
    result = result.filter((t) => t.status === options.status);
  }
  if (options.priority && options.priority !== "all") {
    result = result.filter((t) => t.priority === options.priority);
  }
  if (options.assignedTo && options.assignedTo !== "all") {
    result = result.filter((t) => t.assignedTo === options.assignedTo);
  }
  if (options.dueDateFilter) {
    result = result.filter((task) => matchesDueDateFilter(
      task,
      options.dueDateFilter,
      options.dueDateFrom,
      options.dueDateTo
    ));
  }
  const sortBy = options.sortBy || "createdAt";
  const sortOrder = options.sortOrder || "desc";
  const modifier = sortOrder === "asc" ? 1 : -1;
  result.sort((a, b) => {
    if (sortBy === "priority") {
      const weightA = PRIORITY_WEIGHTS[a.priority] || 0;
      const weightB = PRIORITY_WEIGHTS[b.priority] || 0;
      return (weightA - weightB) * modifier;
    }
    if (sortBy === "dueDate") {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return (new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()) * modifier;
    }
    if (sortBy === "title") {
      return a.title.localeCompare(b.title) * modifier;
    }
    return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * modifier;
  });
  return result;
}

// server/routes/tasks.ts
var tasksRouter = Router3();
var VALID_STATUSES = ["todo", "in_progress", "review", "completed"];
var VALID_PRIORITIES = ["low", "medium", "high", "urgent"];
tasksRouter.get("/", authenticate, (req, res) => {
  const user = req.user;
  const rawQuery = req.query;
  function toStr(v) {
    if (v === void 0 || v === null) return void 0;
    if (typeof v === "string") return v;
    if (typeof v === "object") return void 0;
    return String(v);
  }
  const projectId = toStr(rawQuery.projectId);
  const status = toStr(rawQuery.status);
  const priority = toStr(rawQuery.priority);
  const assignedTo = toStr(rawQuery.assignedTo);
  const search = toStr(rawQuery.search);
  const sortBy = toStr(rawQuery.sortBy);
  const sortOrder = toStr(rawQuery.sortOrder);
  const dueDateFilter = toStr(rawQuery.dueDateFilter);
  const dueDateFrom = toStr(rawQuery.dueDateFrom);
  const dueDateTo = toStr(rawQuery.dueDateTo);
  if (rawQuery.dueDateFrom !== void 0 && typeof rawQuery.dueDateFrom !== "string" || rawQuery.dueDateTo !== void 0 && typeof rawQuery.dueDateTo !== "string") {
    res.status(400).json({ error: "Due-date range boundaries must be single text values." });
    return;
  }
  const allowedStatuses = ["todo", "in_progress", "review", "completed"];
  const allowedSortFields = ["dueDate", "priority", "createdAt", "title"];
  if (status && status !== "all" && !allowedStatuses.includes(status)) {
    res.status(400).json({ error: "Invalid task status filter." });
    return;
  }
  if (priority && priority !== "all" && !VALID_PRIORITIES.includes(priority)) {
    res.status(400).json({ error: "Invalid task priority filter." });
    return;
  }
  if (sortBy && !allowedSortFields.includes(sortBy)) {
    res.status(400).json({ error: "Invalid task sort field." });
    return;
  }
  if (sortOrder && sortOrder !== "asc" && sortOrder !== "desc") {
    res.status(400).json({ error: "Invalid task sort order." });
    return;
  }
  const allowedDueDateFilters = ["overdue", "today", "this_week", "none", "custom"];
  if (rawQuery.dueDateFilter !== void 0 && typeof rawQuery.dueDateFilter !== "string") {
    res.status(400).json({ error: "Due-date filter must be a single text value." });
    return;
  }
  if (dueDateFilter && !allowedDueDateFilters.includes(dueDateFilter)) {
    res.status(400).json({ error: "Invalid due-date filter." });
    return;
  }
  if ((dueDateFrom || dueDateTo) && dueDateFilter !== "custom") {
    res.status(400).json({ error: "A custom due-date range requires dueDateFilter=custom." });
    return;
  }
  if (dueDateFilter === "custom") {
    if (!dueDateFrom || !dueDateTo || !isValidDateOnly(dueDateFrom) || !isValidDateOnly(dueDateTo)) {
      res.status(400).json({ error: "Custom due-date ranges require valid YYYY-MM-DD from and to dates." });
      return;
    }
    if (dueDateFrom > dueDateTo) {
      res.status(400).json({ error: "Custom due-date range start must be on or before its end." });
      return;
    }
  }
  if (projectId) {
    const project = database.getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!hasProjectAccess(project, user)) {
      res.status(403).json({ error: "Forbidden: You do not have permission to view tasks in this project." });
      return;
    }
  }
  let allTasks = database.getTasks(projectId);
  if (user.role !== "admin" && !projectId) {
    const accessibleProjects = database.getProjects().filter(
      (p) => p.ownerId === user.id || Array.isArray(p.members) && p.members.some((m) => m.userId === user.id)
    );
    const accessibleProjectIds = new Set(accessibleProjects.map((p) => p.id));
    allTasks = allTasks.filter((t) => accessibleProjectIds.has(t.projectId));
  }
  const filtered = filterAndSortTasks(allTasks, {
    projectId,
    status: status === "all" ? "all" : status,
    priority: priority === "all" ? "all" : priority,
    assignedTo,
    search,
    sortBy,
    sortOrder,
    dueDateFilter,
    dueDateFrom,
    dueDateTo
  });
  res.json(filtered);
});
tasksRouter.get("/:id", authenticate, (req, res) => {
  const user = req.user;
  const task = database.getTaskById(req.params.id);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  const project = database.getProjectById(task.projectId);
  if (project) {
    if (!hasProjectAccess(project, user)) {
      res.status(403).json({ error: "Forbidden: You do not have access to this task." });
      return;
    }
  }
  res.json(task);
});
tasksRouter.post("/", authenticate, (req, res) => {
  const user = req.user;
  const {
    projectId,
    title,
    description,
    status,
    priority,
    assignedTo,
    labels,
    startDate,
    dueDate,
    estimatedHours
  } = req.body;
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    res.status(400).json({ error: "Task title is required." });
    return;
  }
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required." });
    return;
  }
  const project = database.getProjectById(projectId);
  if (!project) {
    res.status(404).json({ error: "Target project does not exist." });
    return;
  }
  if (!hasProjectAccess(project, user)) {
    res.status(403).json({ error: "Forbidden: You must be a project member or owner to create tasks in this project." });
    return;
  }
  if (description !== void 0 && typeof description !== "string") {
    res.status(400).json({ error: "Task description must be text." });
    return;
  }
  if (assignedTo) {
    const assignee = database.getUserById(assignedTo);
    const eligible = assignee && (user.role === "admin" || assignee.id === project.ownerId || project.members.some((m) => m.userId === assignee.id));
    if (!eligible) {
      res.status(400).json({ error: "Assignee must be an eligible member of this project." });
      return;
    }
  }
  if (labels !== void 0 && (!Array.isArray(labels) || labels.some((label) => typeof label !== "string"))) {
    res.status(400).json({ error: "Labels must be an array of text values." });
    return;
  }
  if (status !== void 0 && !VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
    return;
  }
  if (priority !== void 0 && !VALID_PRIORITIES.includes(priority)) {
    res.status(400).json({ error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(", ")}` });
    return;
  }
  const validDate = (value) => value === void 0 || value === "" || typeof value === "string" && Number.isFinite(Date.parse(value));
  if (!validDate(startDate) || !validDate(dueDate)) {
    res.status(400).json({ error: "Task dates must be valid date strings." });
    return;
  }
  if (startDate && dueDate && Date.parse(dueDate) < Date.parse(startDate)) {
    res.status(400).json({ error: "Task due date must be on or after its start date." });
    return;
  }
  if (estimatedHours !== void 0 && estimatedHours !== "" && (!Number.isFinite(Number(estimatedHours)) || Number(estimatedHours) < 0)) {
    res.status(400).json({ error: "Estimated hours must be a non-negative number." });
    return;
  }
  if (title.trim().length > 200) {
    res.status(400).json({ error: "Task title must be 200 characters or fewer." });
    return;
  }
  const taskStatus = status ?? "todo";
  const taskPriority = priority ?? "medium";
  const columnTasks = database.getTasks(projectId).filter((t) => t.status === taskStatus);
  const nextOrder = columnTasks.length;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const newTask = {
    id: `tsk-${Date.now()}-${Math.floor(Math.random() * 1e3)}`,
    projectId,
    title: title.trim(),
    description: description || "",
    status: taskStatus,
    priority: taskPriority,
    assignedTo: assignedTo || void 0,
    createdBy: user.id,
    labels: Array.isArray(labels) ? labels.map((l) => String(l).trim()) : [],
    startDate: startDate || now,
    dueDate: dueDate ? new Date(dueDate).toISOString() : void 0,
    order: nextOrder,
    estimatedHours: estimatedHours !== void 0 && estimatedHours !== "" ? Number(estimatedHours) : void 0,
    createdAt: now,
    updatedAt: now
  };
  const created = database.createTask(newTask, user.id);
  res.status(201).json(created);
});
tasksRouter.patch("/:id", authenticate, (req, res) => {
  const user = req.user;
  const task = database.getTaskById(req.params.id);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  const project = database.getProjectById(task.projectId);
  if (!project) {
    res.status(404).json({ error: "Associated project not found" });
    return;
  }
  if (!hasProjectAccess(project, user)) {
    res.status(403).json({ error: "Forbidden: You do not have access to this project." });
    return;
  }
  const canFullEdit = canEditTask(project, task, user);
  const forbiddenFields = getForbiddenTaskEditFields(req.body, canFullEdit);
  if (forbiddenFields.length > 0) {
    res.status(403).json({ error: "Forbidden: You cannot edit these task fields.", fields: forbiddenFields });
    return;
  }
  const {
    title,
    description,
    status,
    priority,
    assignedTo,
    labels,
    startDate,
    dueDate,
    order,
    estimatedHours,
    actualHours
  } = req.body;
  if (status !== void 0 && !VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
    return;
  }
  if (priority !== void 0 && !VALID_PRIORITIES.includes(priority)) {
    res.status(400).json({ error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(", ")}` });
    return;
  }
  const validDate = (value) => value === void 0 || value === "" || typeof value === "string" && Number.isFinite(Date.parse(value));
  if (!validDate(startDate) || !validDate(dueDate)) {
    res.status(400).json({ error: "Task dates must be valid date strings." });
    return;
  }
  const effectiveStart = startDate ?? task.startDate;
  const effectiveDue = dueDate ?? task.dueDate;
  if (effectiveDue && effectiveStart && Date.parse(effectiveDue) < Date.parse(effectiveStart)) {
    res.status(400).json({ error: "Task due date must be on or after its start date." });
    return;
  }
  if (description !== void 0 && typeof description !== "string") {
    res.status(400).json({ error: "Task description must be text." });
    return;
  }
  if (labels !== void 0 && (!Array.isArray(labels) || labels.some((label) => typeof label !== "string"))) {
    res.status(400).json({ error: "Labels must be an array of text values." });
    return;
  }
  if (assignedTo !== void 0 && assignedTo !== "") {
    const assignee = database.getUserById(assignedTo);
    if (!assignee || user.role !== "admin" && assignee.id !== project.ownerId && !project.members.some((m) => m.userId === assignee.id)) {
      res.status(400).json({ error: "Assignee must be an eligible member of this project." });
      return;
    }
  }
  if (order !== void 0 && (!Number.isFinite(Number(order)) || Number(order) < 0)) {
    res.status(400).json({ error: "Task order must be a non-negative number." });
    return;
  }
  if (estimatedHours !== void 0 && estimatedHours !== "" && (!Number.isFinite(Number(estimatedHours)) || Number(estimatedHours) < 0)) {
    res.status(400).json({ error: "Estimated hours must be a non-negative number." });
    return;
  }
  if (actualHours !== void 0 && actualHours !== "" && (!Number.isFinite(Number(actualHours)) || Number(actualHours) < 0)) {
    res.status(400).json({ error: "Actual hours must be a non-negative number." });
    return;
  }
  if (title !== void 0 && (typeof title !== "string" || title.trim().length === 0 || title.trim().length > 200)) {
    res.status(400).json({ error: "Task title must contain 1 to 200 characters." });
    return;
  }
  const updates = {};
  if (status !== void 0) updates.status = status;
  if (order !== void 0) updates.order = Number(order);
  if (canFullEdit) {
    if (title !== void 0 && typeof title === "string" && title.trim().length > 0) {
      updates.title = title.trim();
    }
    if (description !== void 0) updates.description = description;
    if (priority !== void 0) updates.priority = priority;
    if (assignedTo !== void 0) updates.assignedTo = assignedTo || void 0;
    if (labels !== void 0 && Array.isArray(labels)) updates.labels = labels;
    if (startDate !== void 0) updates.startDate = startDate;
    if (dueDate !== void 0) updates.dueDate = dueDate ? new Date(dueDate).toISOString() : void 0;
    if (estimatedHours !== void 0) updates.estimatedHours = estimatedHours === "" ? void 0 : Number(estimatedHours);
    if (actualHours !== void 0) updates.actualHours = actualHours === "" ? void 0 : Number(actualHours);
  }
  const updated = database.updateTask(req.params.id, updates, user.id);
  res.json(updated);
});
tasksRouter.post("/batch-move", authenticate, (req, res) => {
  const user = req.user;
  const { moves } = req.body;
  if (!Array.isArray(moves)) {
    res.status(400).json({ error: "Moves array is required." });
    return;
  }
  for (const move of moves) {
    const task = database.getTaskById(move.id);
    if (task) {
      const project = database.getProjectById(task.projectId);
      if (project) {
        if (hasProjectAccess(project, user)) {
          database.updateTask(
            move.id,
            {
              status: VALID_STATUSES.includes(move.status) ? move.status : task.status,
              order: typeof move.order === "number" ? move.order : 0
            },
            user.id
          );
        }
      }
    }
  }
  res.json({ message: "Tasks updated successfully." });
});
tasksRouter.delete("/:id", authenticate, (req, res) => {
  const user = req.user;
  const task = database.getTaskById(req.params.id);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  const project = database.getProjectById(task.projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!canDeleteTask(project, task, user)) {
    res.status(403).json({ error: "Forbidden: Only the task creator, project owner, or an administrator can delete this task." });
    return;
  }
  database.deleteTask(req.params.id, user.id);
  res.json({ message: "Task deleted successfully." });
});

// server/routes/comments.ts
import { Router as Router4 } from "express";
var commentsRouter = Router4();
commentsRouter.get("/task/:taskId", authenticate, (req, res) => {
  const user = req.user;
  const task = database.getTaskById(req.params.taskId);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  const project = database.getProjectById(task.projectId);
  if (project && user.role !== "admin") {
    const isMember = project.ownerId === user.id || Array.isArray(project.members) && project.members.some((m) => m.userId === user.id);
    if (!isMember) {
      res.status(403).json({ error: "Forbidden: You do not have access to this task comments." });
      return;
    }
  }
  const comments = database.getCommentsByTask(req.params.taskId);
  res.json(comments);
});
commentsRouter.post("/task/:taskId", authenticate, (req, res) => {
  const user = req.user;
  const { content } = req.body;
  if (!content || typeof content !== "string" || content.trim().length === 0 || content.length > 4e3) {
    res.status(400).json({ error: "Comment content must contain 1 to 4000 characters." });
    return;
  }
  const task = database.getTaskById(req.params.taskId);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  const project = database.getProjectById(task.projectId);
  if (project && user.role !== "admin") {
    const isMember = project.ownerId === user.id || Array.isArray(project.members) && project.members.some((m) => m.userId === user.id);
    if (!isMember) {
      res.status(403).json({ error: "Forbidden: You must be a project member to comment on this task." });
      return;
    }
  }
  const newComment = database.createComment({
    taskId: req.params.taskId,
    authorId: user.id,
    content: content.trim()
  });
  database.logActivity({
    userId: user.id,
    projectId: task.projectId,
    taskId: task.id,
    action: "commented_task",
    details: `Commented on "${task.title}"`
  });
  res.status(201).json(newComment);
});
commentsRouter.patch("/:id", authenticate, (req, res) => {
  const user = req.user;
  const { content } = req.body;
  if (!content || typeof content !== "string" || content.trim().length === 0 || content.length > 4e3) {
    res.status(400).json({ error: "Comment content must contain 1 to 4000 characters." });
    return;
  }
  const updated = database.updateComment(req.params.id, content.trim(), user.id);
  if (!updated) {
    res.status(403).json({ error: "Forbidden: Only the original author can edit this comment." });
    return;
  }
  res.json(updated);
});
commentsRouter.delete("/:id", authenticate, (req, res) => {
  const user = req.user;
  const isAdmin = user.role === "admin";
  const deleted = database.deleteComment(req.params.id, user.id, isAdmin);
  if (!deleted) {
    res.status(403).json({ error: "Forbidden: Only the comment author or an administrator can delete this comment." });
    return;
  }
  res.json({ message: "Comment deleted successfully." });
});

// server/routes/notifications.ts
import { Router as Router5 } from "express";
var notificationsRouter = Router5();
notificationsRouter.get("/", authenticate, (req, res) => {
  const user = req.user;
  const now = Date.now();
  const existing = database.getNotifications(user.id);
  const existingDeadlineTasks = new Set(existing.filter((notification) => notification.type === "deadline_approaching").map((notification) => notification.relatedTaskId));
  for (const task of database.getTasks()) {
    const dueAt = task.dueDate ? Date.parse(task.dueDate) : NaN;
    if (task.assignedTo === user.id && task.status !== "completed" && Number.isFinite(dueAt) && dueAt >= now && dueAt <= now + 24 * 60 * 60 * 1e3 && !existingDeadlineTasks.has(task.id)) {
      database.createNotification({
        recipientId: user.id,
        type: "deadline_approaching",
        message: `Task "${task.title}" is due within the next 24 hours.`,
        relatedProjectId: task.projectId,
        relatedTaskId: task.id
      });
    }
  }
  const notifs = database.getNotifications(user.id);
  res.json(notifs);
});
notificationsRouter.patch("/:id/read", authenticate, (req, res) => {
  const user = req.user;
  const updated = database.markNotificationRead(req.params.id, user.id);
  if (!updated) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json(updated);
});
notificationsRouter.patch("/read-all", authenticate, (req, res) => {
  const user = req.user;
  database.markAllNotificationsRead(user.id);
  res.json({ message: "All notifications marked as read" });
});

// server/routes/dashboard.ts
import { Router as Router6 } from "express";
var dashboardRouter = Router6();
dashboardRouter.get("/status", authenticate, (_req, res) => {
  res.json(getDatabaseStatus());
});
dashboardRouter.get("/stats", authenticate, (req, res) => {
  const user = req.user;
  const allProjects = database.getProjects();
  const allTasks = database.getTasks();
  const accessibleProjects = user.role === "admin" ? allProjects : allProjects.filter(
    (p) => p.ownerId === user.id || p.members.some((m) => m.userId === user.id)
  );
  const accessibleProjectIds = new Set(accessibleProjects.map((p) => p.id));
  const tasks = allTasks.filter((t) => accessibleProjectIds.has(t.projectId));
  const totalProjects = accessibleProjects.length;
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress").length;
  const reviewTasks = tasks.filter((t) => t.status === "review").length;
  const pendingTasks = tasks.filter((t) => t.status === "todo").length;
  const now = /* @__PURE__ */ new Date();
  const overdueTasks = tasks.filter((t) => isTaskOverdue(t, now)).length;
  const completionRate = totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0;
  const upcomingDeadlines = tasks.filter((t) => t.dueDate && t.status !== "completed" && new Date(t.dueDate) >= now).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).slice(0, 6);
  const statusDistribution = [
    { status: "todo", count: pendingTasks },
    { status: "in_progress", count: inProgressTasks },
    { status: "review", count: reviewTasks },
    { status: "completed", count: completedTasks }
  ];
  const priorityDistribution = [
    { priority: "urgent", count: tasks.filter((t) => t.priority === "urgent").length },
    { priority: "high", count: tasks.filter((t) => t.priority === "high").length },
    { priority: "medium", count: tasks.filter((t) => t.priority === "medium").length },
    { priority: "low", count: tasks.filter((t) => t.priority === "low").length }
  ];
  const recentProjects = [...accessibleProjects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 4);
  const recentActivities = database.getActivities(100).filter((activity) => activity.projectId && accessibleProjectIds.has(activity.projectId)).slice(0, 10);
  const stats = {
    totalProjects,
    totalTasks,
    completedTasks,
    pendingTasks,
    inProgressTasks,
    reviewTasks,
    overdueTasks,
    completionRate,
    recentProjects,
    recentActivities,
    upcomingDeadlines,
    statusDistribution,
    priorityDistribution
  };
  res.json(stats);
});

// server.ts
import { toNodeHandler } from "better-auth/node";

// server/rateLimit.ts
var attempts = /* @__PURE__ */ new Map();
function rateLimit(maxAttempts = 10, windowMs = 15 * 60 * 1e3) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const current = attempts.get(key);
    if (!current || current.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    current.count += 1;
    if (current.count > maxAttempts) {
      res.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1e3));
      res.status(429).json({ error: "Too many attempts. Please try again later." });
      return;
    }
    next();
  };
}

// server.ts
var app = express();
var PORT = Number(process.env.PORT) || 3e3;
var isProd = process.env.NODE_ENV === "production";
var authRateLimit = rateLimit(10, 15 * 60 * 1e3);
app.all("/api/auth/sign-in/*", authRateLimit);
app.all("/api/auth/sign-up/*", authRateLimit);
var betterAuthHandler = toNodeHandler(auth);
app.all("/api/auth/*", (req, res, next) => {
  if (/^\/api\/auth\/(me|users|profile|password)(\/|$)/.test(req.path)) {
    next();
    return;
  }
  void betterAuthHandler(req, res);
});
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use((req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = ((body) => {
    if (req.method === "GET" || req.method === "HEAD") return sendJson(body);
    void flushMongoWrites().then(() => sendJson(body)).catch((error) => {
      console.error("[Database] Mutation failed:", error instanceof Error ? error.message : "unknown error");
      res.status(500);
      sendJson({ error: "The database could not save this change." });
    });
    return res;
  });
  next();
});
app.use("/api/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/comments", commentsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/dashboard", dashboardRouter);
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", time: (/* @__PURE__ */ new Date()).toISOString() });
});
var httpServer;
async function startServer() {
  await initDatabase();
  await connectAuthMongo();
  if (!isProd) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  app.use((err, _req, res, _next) => {
    if (res.headersSent) return;
    if (typeof err === "object" && err !== null && "type" in err && err.type === "entity.too.large") {
      res.status(413).json({ error: "Request body is too large." });
      return;
    }
    if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({ error: "Request body must contain valid JSON." });
      return;
    }
    console.error("[HTTP] Unexpected request error:", err);
    res.status(500).json({ error: "An unexpected server error occurred." });
  });
  httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`TaskFlow Server running on http://0.0.0.0:${PORT}`);
  });
}
async function shutdown(signal) {
  console.log(`[Server] ${signal} received; closing gracefully.`);
  try {
    await flushMongoWrites();
    if (httpServer) await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
    await closeMongo();
    process.exit(0);
  } catch (error) {
    console.error("[Server] Graceful shutdown failed:", error instanceof Error ? error.message : "unknown error");
    process.exit(1);
  }
}
process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});
startServer().catch((err) => {
  const message = err instanceof Error ? err.message : "Unknown startup error.";
  console.error("Failed to start server:", message);
  void closeMongo();
  process.exit(1);
});
