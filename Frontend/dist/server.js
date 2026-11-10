// server.ts
import express from "express";
import path2 from "path";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

// server/db.ts
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { MongoClient } from "mongodb";
var DATA_DIR = path.resolve(process.env.TASKFLOW_DATA_DIR || path.join(process.cwd(), "data"));
var DB_FILE = path.join(DATA_DIR, "database.json");
var db = {
  schemaVersion: 2,
  users: [],
  projects: [],
  tasks: [],
  comments: [],
  notifications: [],
  activities: []
};
var mongoClient = null;
var mongoDb = null;
var isMongoConnected = false;
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
function persistToDisk() {
  try {
    ensureDirectoryExists(DATA_DIR);
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), "utf-8");
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error("[Database] Failed to persist database to disk:", err);
  }
}
async function connectMongo() {
  const uri2 = process.env.MONGODB_URI;
  if (!uri2) {
    console.log("[Database] MONGODB_URI not configured. Operating in high-speed persistent store mode (data/database.json).");
    return false;
  }
  try {
    console.log("[Database] Connecting to MongoDB via Native Driver...");
    mongoClient = new MongoClient(uri2, {
      serverSelectionTimeoutMS: 4e3,
      connectTimeoutMS: 4e3
    });
    await mongoClient.connect();
    const dbName2 = process.env.MONGODB_DB_NAME || "taskflow";
    mongoDb = mongoClient.db(dbName2);
    isMongoConnected = true;
    console.log(`[Database] MongoDB Native Driver successfully connected to database "${dbName2}"!`);
    try {
      await mongoDb.collection("users").createIndex({ email: 1 }, { unique: true });
      await mongoDb.collection("projects").createIndex({ ownerId: 1 });
      await mongoDb.collection("tasks").createIndex({ projectId: 1, status: 1 });
      await mongoDb.collection("tasks").createIndex({ assignedTo: 1 });
      await mongoDb.collection("comments").createIndex({ taskId: 1 });
      await mongoDb.collection("notifications").createIndex({ recipientId: 1, isRead: 1 });
    } catch (idxErr) {
      console.warn("[Database] Index verification warning:", idxErr);
    }
    const schemaMetadata = await mongoDb.collection("metadata").findOne({ id: "taskflow" });
    const userCount = await mongoDb.collection("users").countDocuments();
    if (userCount > 0) {
      const users = await mongoDb.collection("users").find({}).toArray();
      const projects = await mongoDb.collection("projects").find({}).toArray();
      const tasks = await mongoDb.collection("tasks").find({}).toArray();
      const comments = await mongoDb.collection("comments").find({}).toArray();
      const notifications = await mongoDb.collection("notifications").find({}).toArray();
      const activities = await mongoDb.collection("activities").find({}).toArray();
      db = {
        schemaVersion: typeof schemaMetadata?.schemaVersion === "number" ? schemaMetadata.schemaVersion : 0,
        users,
        projects,
        tasks,
        comments,
        notifications,
        activities
      };
      migrateDatabaseSchema();
      if (db.schemaVersion >= 2) {
        await Promise.all(db.users.map((user) => mongoDb.collection("users").updateOne({ id: user.id }, { $set: user })));
        await mongoDb.collection("metadata").updateOne({ id: "taskflow" }, { $set: { schemaVersion: 2 } }, { upsert: true });
      }
      persistToDisk();
      console.log(`[Database] Hydrated cache with ${users.length} users, ${projects.length} projects, and ${tasks.length} tasks from MongoDB.`);
    } else {
      console.log("[Database] MongoDB collections are empty. Populating with initial seed dataset...");
      if (db.users.length > 0) {
        await mongoDb.collection("users").insertMany(db.users);
        await mongoDb.collection("projects").insertMany(db.projects);
        await mongoDb.collection("tasks").insertMany(db.tasks);
        await mongoDb.collection("comments").insertMany(db.comments);
        await mongoDb.collection("notifications").insertMany(db.notifications);
        await mongoDb.collection("activities").insertMany(db.activities);
        await mongoDb.collection("metadata").updateOne({ id: "taskflow" }, { $set: { schemaVersion: 2 } }, { upsert: true });
        console.log("[Database] Seed dataset pushed to MongoDB successfully.");
      }
    }
    return true;
  } catch (err) {
    console.warn("[Database] MongoDB connection attempt finished with fallback:", err.message || err);
    console.log("[Database] Active persistence: Local file engine with atomic writes.");
    isMongoConnected = false;
    return false;
  }
}
function getDatabaseStatus() {
  return {
    isMongoConnected,
    mode: isMongoConnected ? "MongoDB Native Driver" : "Embedded Persistent Store",
    dataFile: DB_FILE,
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
  ensureDirectoryExists(DATA_DIR);
  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      db = JSON.parse(content);
      migrateDatabaseSchema();
      console.log("[Database] Loaded existing database records from disk:", {
        users: db.users.length,
        projects: db.projects.length,
        tasks: db.tasks.length
      });
    } catch (err) {
      console.warn("[Database] Could not read existing database, re-seeding...", err);
      seedInitialData();
    }
  } else {
    seedInitialData();
  }
  await connectMongo();
}
function seedInitialData() {
  const seedPassword = process.env.TASKFLOW_SEED_PASSWORD || randomBytes(32).toString("base64url");
  const defaultPasswordHash = bcrypt.hashSync(seedPassword, 10);
  const now = /* @__PURE__ */ new Date();
  const pastDays = (d) => new Date(now.getTime() - d * 864e5).toISOString();
  const futureDays = (d) => new Date(now.getTime() + d * 864e5).toISOString();
  const users = [
    {
      id: "usr-1",
      name: "Alex Morgan",
      email: "alex@taskflow.dev",
      passwordHash: defaultPasswordHash,
      role: "admin",
      jobTitle: "Principal Engineer & Admin",
      department: "Engineering",
      avatar: "/src/assets/images/avatar_alex_lead_1794315026659.jpg",
      createdAt: pastDays(30),
      updatedAt: pastDays(1)
    },
    {
      id: "usr-2",
      name: "Sarah Connor",
      email: "sarah@taskflow.dev",
      passwordHash: defaultPasswordHash,
      role: "project_owner",
      jobTitle: "Staff Product Manager",
      department: "Product",
      avatar: "/src/assets/images/avatar_sarah_pm_1794315026386.jpg",
      createdAt: pastDays(28),
      updatedAt: pastDays(2)
    },
    {
      id: "usr-3",
      name: "Michael Chen",
      email: "michael@taskflow.dev",
      passwordHash: defaultPasswordHash,
      role: "member",
      jobTitle: "Senior Frontend Developer",
      department: "Engineering",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
      createdAt: pastDays(25),
      updatedAt: pastDays(3)
    },
    {
      id: "usr-4",
      name: "Elena Rostova",
      email: "elena@taskflow.dev",
      passwordHash: defaultPasswordHash,
      role: "member",
      jobTitle: "UI/UX Design Lead",
      department: "Design",
      avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80",
      createdAt: pastDays(20),
      updatedAt: pastDays(5)
    }
  ];
  const projects = [
    {
      id: "proj-1",
      name: "TaskFlow SaaS Core Platform",
      description: "Enterprise task orchestration engine, drag-and-drop Kanban board, real-time collaboration, and analytics reporting.",
      ownerId: "usr-1",
      members: [
        { userId: "usr-1", role: "owner", joinedAt: pastDays(30) },
        { userId: "usr-2", role: "member", joinedAt: pastDays(28) },
        { userId: "usr-3", role: "member", joinedAt: pastDays(25) },
        { userId: "usr-4", role: "member", joinedAt: pastDays(20) }
      ],
      startDate: pastDays(30),
      dueDate: futureDays(20),
      color: "#3B82F6",
      // Blue
      category: "Product Development",
      createdAt: pastDays(30),
      updatedAt: pastDays(1)
    },
    {
      id: "proj-2",
      name: "Mobile Touch & Responsive UX",
      description: "Fluid viewport adaptation for tablet and mobile devices, swipe gesture cards, and responsive drawer navigation.",
      ownerId: "usr-2",
      members: [
        { userId: "usr-2", role: "owner", joinedAt: pastDays(20) },
        { userId: "usr-3", role: "member", joinedAt: pastDays(18) },
        { userId: "usr-4", role: "member", joinedAt: pastDays(15) }
      ],
      startDate: pastDays(20),
      dueDate: futureDays(12),
      color: "#10B981",
      // Emerald
      category: "Mobile UX",
      createdAt: pastDays(20),
      updatedAt: pastDays(2)
    },
    {
      id: "proj-3",
      name: "Security & Access Control Audit",
      description: "End-to-end audit for RBAC roles, JWT session handling, rate limiting, and password hashing standard.",
      ownerId: "usr-1",
      members: [
        { userId: "usr-1", role: "owner", joinedAt: pastDays(14) },
        { userId: "usr-2", role: "member", joinedAt: pastDays(10) }
      ],
      startDate: pastDays(14),
      dueDate: pastDays(2),
      // Overdue intentionally for stats demo
      color: "#F59E0B",
      // Amber
      category: "Security",
      createdAt: pastDays(14),
      updatedAt: pastDays(3)
    }
  ];
  const tasks = [
    // Project 1 Tasks
    {
      id: "tsk-101",
      projectId: "proj-1",
      title: "Design interactive Kanban board columns",
      description: "Build four Kanban columns (Todo, In Progress, Review, Completed) with responsive drop targets and visual feedback.",
      status: "completed",
      priority: "high",
      assignedTo: "usr-3",
      createdBy: "usr-1",
      labels: ["frontend", "kanban", "ui"],
      startDate: pastDays(15),
      dueDate: pastDays(5),
      order: 0,
      estimatedHours: 12,
      actualHours: 10,
      createdAt: pastDays(15),
      updatedAt: pastDays(5)
    },
    {
      id: "tsk-102",
      projectId: "proj-1",
      title: "Build REST API endpoints for task CRUD",
      description: "Implement Express routers for tasks with query filtering, pagination, and role-based permissions.",
      status: "completed",
      priority: "urgent",
      assignedTo: "usr-1",
      createdBy: "usr-1",
      labels: ["backend", "api", "express"],
      startDate: pastDays(12),
      dueDate: pastDays(3),
      order: 1,
      estimatedHours: 8,
      actualHours: 7,
      createdAt: pastDays(12),
      updatedAt: pastDays(3)
    },
    {
      id: "tsk-103",
      projectId: "proj-1",
      title: "Implement drag-and-drop state synchronization",
      description: "Update task column positions instantly in state and persist PATCH /api/tasks/:id payload to backend.",
      status: "in_progress",
      priority: "urgent",
      assignedTo: "usr-3",
      createdBy: "usr-2",
      labels: ["frontend", "state", "dnd"],
      startDate: pastDays(4),
      dueDate: futureDays(2),
      order: 0,
      estimatedHours: 16,
      actualHours: 8,
      createdAt: pastDays(4),
      updatedAt: pastDays(1)
    },
    {
      id: "tsk-104",
      projectId: "proj-1",
      title: "Task comments and discussion thread",
      description: "Allow team members to comment on tasks, edit comments, and view author timestamps.",
      status: "review",
      priority: "medium",
      assignedTo: "usr-4",
      createdBy: "usr-1",
      labels: ["collaboration", "comments"],
      startDate: pastDays(6),
      dueDate: futureDays(4),
      order: 0,
      estimatedHours: 10,
      actualHours: 9,
      createdAt: pastDays(6),
      updatedAt: pastDays(1)
    },
    {
      id: "tsk-105",
      projectId: "proj-1",
      title: "In-app notification system with badge count",
      description: "Notify users when tasks are assigned, deadlines approach, or comments are created.",
      status: "todo",
      priority: "high",
      assignedTo: "usr-1",
      createdBy: "usr-2",
      labels: ["notifications", "backend"],
      startDate: pastDays(2),
      dueDate: futureDays(6),
      order: 0,
      estimatedHours: 14,
      createdAt: pastDays(2),
      updatedAt: pastDays(2)
    },
    {
      id: "tsk-106",
      projectId: "proj-1",
      title: "Full dashboard analytics and metrics cards",
      description: "Display completion statistics, overdue counts, upcoming deadlines, and activity logs.",
      status: "in_progress",
      priority: "high",
      assignedTo: "usr-3",
      createdBy: "usr-1",
      labels: ["dashboard", "analytics"],
      startDate: pastDays(3),
      dueDate: futureDays(5),
      order: 1,
      estimatedHours: 12,
      actualHours: 6,
      createdAt: pastDays(3),
      updatedAt: pastDays(1)
    },
    {
      id: "tsk-107",
      projectId: "proj-1",
      title: "Implement Dark / Light mode with zero contrast flaws",
      description: "Ensure all cards, modals, and typography adhere to Tailwind v4 custom dark variant.",
      status: "completed",
      priority: "medium",
      assignedTo: "usr-4",
      createdBy: "usr-3",
      labels: ["theme", "css", "design"],
      startDate: pastDays(8),
      dueDate: pastDays(2),
      order: 2,
      estimatedHours: 6,
      actualHours: 5,
      createdAt: pastDays(8),
      updatedAt: pastDays(2)
    },
    // Project 2 Tasks
    {
      id: "tsk-201",
      projectId: "proj-2",
      title: "Design mobile navigation drawer and bottom bar",
      description: "Create responsive header and sidebar toggle for screens under 768px width.",
      status: "in_progress",
      priority: "high",
      assignedTo: "usr-4",
      createdBy: "usr-2",
      labels: ["mobile", "responsive"],
      startDate: pastDays(5),
      dueDate: futureDays(3),
      order: 0,
      estimatedHours: 8,
      createdAt: pastDays(5),
      updatedAt: pastDays(1)
    },
    {
      id: "tsk-202",
      projectId: "proj-2",
      title: "Test touch swipe gestures on Kanban columns",
      description: "Provide horizontal scroll snap and tap-to-move dropdown for mobile devices.",
      status: "todo",
      priority: "medium",
      assignedTo: "usr-3",
      createdBy: "usr-2",
      labels: ["mobile", "touch"],
      startDate: pastDays(2),
      dueDate: futureDays(8),
      order: 0,
      estimatedHours: 10,
      createdAt: pastDays(2),
      updatedAt: pastDays(2)
    },
    // Project 3 Tasks (Overdue item for testing stats)
    {
      id: "tsk-301",
      projectId: "proj-3",
      title: "Verify JWT expiration and refresh logic",
      description: "Validate token lifespans and ensure secure cookie storage with SameSite flags.",
      status: "todo",
      priority: "urgent",
      assignedTo: "usr-1",
      createdBy: "usr-1",
      labels: ["security", "auth"],
      startDate: pastDays(10),
      dueDate: pastDays(1),
      // Overdue
      order: 0,
      estimatedHours: 6,
      createdAt: pastDays(10),
      updatedAt: pastDays(1)
    }
  ];
  const comments = [
    {
      id: "com-1",
      taskId: "tsk-103",
      authorId: "usr-1",
      content: "I verified the drag-and-drop backend route. The order and status attributes are correctly updated on PATCH.",
      createdAt: pastDays(2),
      updatedAt: pastDays(2)
    },
    {
      id: "com-2",
      taskId: "tsk-103",
      authorId: "usr-3",
      content: "Awesome! Adding smooth CSS transition cards so moving tasks feels snappy and responsive.",
      createdAt: pastDays(1),
      updatedAt: pastDays(1)
    },
    {
      id: "com-3",
      taskId: "tsk-104",
      authorId: "usr-2",
      content: "Make sure comment deletion is restricted to either the original author or workspace admins.",
      createdAt: pastDays(3),
      updatedAt: pastDays(3)
    }
  ];
  const notifications = [
    {
      id: "notif-1",
      recipientId: "usr-1",
      type: "task_assigned",
      message: 'You have been assigned to "In-app notification system with badge count"',
      relatedProjectId: "proj-1",
      relatedTaskId: "tsk-105",
      isRead: false,
      createdAt: pastDays(1)
    },
    {
      id: "notif-2",
      recipientId: "usr-1",
      type: "deadline_approaching",
      message: 'Task "Verify JWT expiration and refresh logic" is past its scheduled deadline.',
      relatedProjectId: "proj-3",
      relatedTaskId: "tsk-301",
      isRead: false,
      createdAt: pastDays(1)
    },
    {
      id: "notif-3",
      recipientId: "usr-1",
      type: "comment_added",
      message: 'Michael Chen commented on "Implement drag-and-drop state synchronization"',
      relatedProjectId: "proj-1",
      relatedTaskId: "tsk-103",
      isRead: true,
      createdAt: pastDays(2)
    },
    {
      id: "notif-4",
      recipientId: "usr-2",
      type: "project_invited",
      message: 'You were added as Project Owner to "Mobile Touch & Responsive UX"',
      relatedProjectId: "proj-2",
      isRead: false,
      createdAt: pastDays(5)
    }
  ];
  const activities = [
    {
      id: "act-1",
      userId: "usr-1",
      projectId: "proj-1",
      taskId: "tsk-102",
      action: "completed_task",
      details: 'Completed task "Build REST API endpoints for task CRUD"',
      createdAt: pastDays(3)
    },
    {
      id: "act-2",
      userId: "usr-3",
      projectId: "proj-1",
      taskId: "tsk-103",
      action: "status_changed",
      details: 'Moved task "Implement drag-and-drop state synchronization" to In Progress',
      createdAt: pastDays(2)
    },
    {
      id: "act-3",
      userId: "usr-4",
      projectId: "proj-1",
      taskId: "tsk-107",
      action: "completed_task",
      details: 'Completed task "Implement Dark / Light mode with zero contrast flaws"',
      createdAt: pastDays(2)
    },
    {
      id: "act-4",
      userId: "usr-1",
      projectId: "proj-1",
      action: "created_project",
      details: 'Created project "TaskFlow SaaS Core Platform"',
      createdAt: pastDays(30)
    }
  ];
  db = {
    schemaVersion: 2,
    users,
    projects,
    tasks,
    comments,
    notifications,
    activities
  };
  persistToDisk();
  console.log("[Database] Database initialized with seed data successfully.");
}
function migrateDatabaseSchema() {
  if (Number.isInteger(db.schemaVersion) && db.schemaVersion >= 2) return;
  const legacyAccounts = db.users.filter((u) => ["alex@taskflow.dev", "sarah@taskflow.dev", "michael@taskflow.dev", "elena@taskflow.dev"].includes(u.email));
  for (const user of legacyAccounts) {
    const replacementPassword = process.env.TASKFLOW_SEED_PASSWORD || randomBytes(32).toString("base64url");
    user.passwordHash = bcrypt.hashSync(replacementPassword, 10);
  }
  db.schemaVersion = 2;
  persistToDisk();
}
var database = {
  // Users
  getUsers: () => db.users,
  getUserById: (id) => db.users.find((u) => u.id === id),
  getUserByEmail: (email) => db.users.find((u) => u.email.toLowerCase() === email.toLowerCase()),
  createUser: (user) => {
    db.users.push(user);
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection("users").insertOne({ ...user }).catch(console.error);
    }
    return user;
  },
  updateUser: (id, updates) => {
    const index = db.users.findIndex((u) => u.id === id);
    if (index === -1) return null;
    db.users[index] = { ...db.users[index], ...updates, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection("users").updateOne({ id }, { $set: db.users[index] }).catch(console.error);
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
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection("projects").insertOne({ ...project }).catch(console.error);
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
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection("projects").updateOne({ id }, { $set: db.projects[index] }).catch(console.error);
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
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection("projects").deleteOne({ id }).catch(console.error);
      mongoDb.collection("tasks").deleteMany({ projectId: id }).catch(console.error);
      mongoDb.collection("comments").deleteMany({ taskId: { $in: taskIds } }).catch(console.error);
      mongoDb.collection("notifications").deleteMany({ $or: [{ relatedProjectId: id }, { relatedTaskId: { $in: taskIds } }] }).catch(console.error);
      mongoDb.collection("activities").deleteMany({ projectId: id }).catch(console.error);
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
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection("tasks").insertOne({ ...task }).catch(console.error);
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
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection("tasks").updateOne({ id }, { $set: db.tasks[index] }).catch(console.error);
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
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection("tasks").deleteOne({ id }).catch(console.error);
      mongoDb.collection("comments").deleteMany({ taskId: id }).catch(console.error);
      mongoDb.collection("notifications").deleteMany({ relatedTaskId: id }).catch(console.error);
      mongoDb.collection("activities").deleteMany({ taskId: id }).catch(console.error);
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
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection("comments").insertOne({ ...newComment }).catch(console.error);
    }
    return newComment;
  },
  updateComment: (id, content, authorId) => {
    const index = db.comments.findIndex((c) => c.id === id);
    if (index === -1) return null;
    if (db.comments[index].authorId !== authorId) return null;
    db.comments[index].content = content;
    db.comments[index].updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection("comments").updateOne({ id }, { $set: db.comments[index] }).catch(console.error);
    }
    return db.comments[index];
  },
  deleteComment: (id, userId, isAdmin) => {
    const comment = db.comments.find((c) => c.id === id);
    if (!comment) return false;
    if (comment.authorId !== userId && !isAdmin) return false;
    db.comments = db.comments.filter((c) => c.id !== id);
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection("comments").deleteOne({ id }).catch(console.error);
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
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection("notifications").insertOne({ ...newNotif }).catch(console.error);
    }
    return newNotif;
  },
  markNotificationRead: (id, recipientId) => {
    const notif = db.notifications.find((n) => n.id === id && n.recipientId === recipientId);
    if (!notif) return null;
    notif.isRead = true;
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection("notifications").updateOne({ id }, { $set: { isRead: true } }).catch(console.error);
    }
    return notif;
  },
  markAllNotificationsRead: (recipientId) => {
    for (const notif of db.notifications) {
      if (notif.recipientId === recipientId) {
        notif.isRead = true;
      }
    }
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection("notifications").updateMany({ recipientId }, { $set: { isRead: true } }).catch(console.error);
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
    persistToDisk();
    if (isMongoConnected && mongoDb) {
      mongoDb.collection("activities").insertOne({ ...newAct }).catch(console.error);
    }
    return newAct;
  }
};

// server/routes/auth.ts
import { Router } from "express";

// server/auth.ts
import { fromNodeHeaders } from "better-auth/node";

// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { MongoClient as MongoClient2 } from "mongodb";
import { randomBytes as randomBytes2 } from "node:crypto";
var uri = process.env.MONGODB_URI;
var client = uri ? new MongoClient2(uri) : null;
var dbName = process.env.MONGODB_DB_NAME || "taskflow";
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
            database.createUser({
              id: user.id,
              name: user.name,
              email: user.email,
              role: "member",
              jobTitle: "Team Member",
              department: "Operations",
              avatar: user.image || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}`,
              createdAt: user.createdAt.toISOString(),
              updatedAt: user.updatedAt.toISOString(),
              passwordHash: randomBytes2(32).toString("hex")
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
  if (client) await client.connect();
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
authRouter.get("/users", authenticate, (req, res) => {
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
  if (user.role !== "admin" && project.ownerId !== user.id) {
    res.status(403).json({ error: "Only the project owner or an administrator can add members." });
    return;
  }
  const { userId, role } = req.body;
  if (!userId || !database.getUserById(userId)) {
    res.status(400).json({ error: "Valid user ID is required." });
    return;
  }
  if (project.members.some((m) => m.userId === userId)) {
    res.status(400).json({ error: "User is already a member of this project." });
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
  if (user.role !== "admin" && project.ownerId !== user.id) {
    res.status(403).json({ error: "Only the project owner or an administrator can remove members." });
    return;
  }
  if (req.params.userId === project.ownerId) {
    res.status(400).json({ error: "Cannot remove the primary project owner." });
    return;
  }
  const updatedMembers = project.members.filter((m) => m.userId !== req.params.userId);
  const updated = database.updateProject(req.params.id, { members: updatedMembers }, user.id);
  res.json(updated);
});

// server/routes/tasks.ts
import { Router as Router3 } from "express";

// src/utils/taskCalculations.ts
function isTaskOverdue(task, referenceDate = /* @__PURE__ */ new Date()) {
  if (!task.dueDate || task.status === "completed") return false;
  const due = new Date(task.dueDate);
  return due.getTime() < referenceDate.getTime();
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
function checkProjectAccess(userId, userRole, project) {
  if (userRole === "admin") return { hasAccess: true, isOwner: true };
  const isOwner = project.ownerId === userId;
  const isMember = isOwner || Array.isArray(project.members) && project.members.some((m) => m.userId === userId);
  return { hasAccess: isMember, isOwner };
}
tasksRouter.get("/", authenticate, (req, res) => {
  const user = req.user;
  const { projectId, status, priority, assignedTo, search, sortBy, sortOrder } = req.query;
  if (projectId) {
    const project = database.getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const { hasAccess } = checkProjectAccess(user.id, user.role, project);
    if (!hasAccess) {
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
    status,
    priority,
    assignedTo,
    search,
    sortBy,
    sortOrder
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
    const { hasAccess } = checkProjectAccess(user.id, user.role, project);
    if (!hasAccess) {
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
  const { hasAccess } = checkProjectAccess(user.id, user.role, project);
  if (!hasAccess) {
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
  const { hasAccess, isOwner } = checkProjectAccess(user.id, user.role, project);
  if (!hasAccess) {
    res.status(403).json({ error: "Forbidden: You do not have access to this project." });
    return;
  }
  const isCreatorOrAssignee = task.createdBy === user.id || task.assignedTo === user.id;
  const canFullEdit = user.role === "admin" || isOwner || isCreatorOrAssignee;
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
        const { hasAccess } = checkProjectAccess(user.id, user.role, project);
        if (hasAccess) {
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
  const isOwner = project.ownerId === user.id;
  const isCreator = task.createdBy === user.id;
  const canDelete = user.role === "admin" || isOwner || isCreator;
  if (!canDelete) {
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
dashboardRouter.get("/status", (req, res) => {
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
dashboardRouter.post("/reset-data", authenticate, (req, res) => {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Only admins can reset the workspace data." });
    return;
  }
  seedInitialData();
  res.json({ message: "Workspace demo data restored to initial baseline." });
});

// server.ts
import { toNodeHandler } from "better-auth/node";
dotenv.config();
var app = express();
var PORT = Number(process.env.PORT) || 3e3;
var isProd = process.env.NODE_ENV === "production";
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
app.use("/api/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/comments", commentsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/dashboard", dashboardRouter);
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: (/* @__PURE__ */ new Date()).toISOString() });
});
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
    const distPath = path2.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path2.join(distPath, "index.html"));
    });
  }
  app.use((err, req, res, _next) => {
    if (res.headersSent) return;
    if (err?.type === "entity.too.large") {
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
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`TaskFlow Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
