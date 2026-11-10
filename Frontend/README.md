# TaskFlow – Full Stack Task & Project Management Application

TaskFlow is a modern, enterprise-grade Full Stack Task & Project Management application inspired by Trello and Asana. Designed for teams and individuals to organize projects, assign responsibilities, track real-time Kanban boards, and optimize productivity.

Developed for the **CodeAlpha Full Stack Development Internship – Task 3 (Project Management Tool)**.

---

## 🚀 Key Features

### 1. Robust Authentication & RBAC Authorization
- Secure JWT-based authentication with password hashing using `bcryptjs`.
- Role-based Access Control (**Admin**, **Project Owner**, **Project Member**).
- Profile management with customizable job titles, departments, and password modification.
- Public registration creates a standard member account; privileged roles are assigned by administrators.

### 2. Comprehensive Analytics Dashboard
- Live metrics: Total Projects, Total Tasks, In Progress, Review, Completed, and Overdue tasks.
- Tabular figures (`tabular-nums`) with real-time velocity and completion rates.
- Priority and Status distribution breakdowns.
- Recent projects progress indicator and upcoming deadlines stream.

### 3. Interactive 4-Column Kanban Board
- Columns: **To Do**, **In Progress**, **In Review**, **Completed**.
- Smooth HTML5 Drag-and-Drop with instant state synchronization.
- Real-time task movement persisted to backend `PATCH /api/tasks/:id`.
- Task cards with priority badges (Urgent, High, Medium, Low), due date alerts, label tags, and assignee avatars.
- Quick mobile move selector for touch viewports.

### 4. Project Management
- Full Project CRUD: create, edit, delete (with confirmation modals), and lifecycle status updates.
- Project categories, customizable color accents, and timeline due dates.
- Project owners and admins can add or remove existing registered project members.

### 5. Task Collaboration & Discussion Threads
- Task discussion comments with author profile attribution and timestamps.
- Author & Admin comment deletion authorization.
- Tag and label management.

### 6. In-App Notification System
- Notification popover with real-time unread badge counts.
- Event triggers: task assignments, approaching deadlines, status transitions, and comments.
- Single and bulk mark-as-read actions.

### 7. Dual-Theme Support (Light & Dark Mode)
- Built with Tailwind CSS v4 `@custom-variant dark`.
- High contrast, WCAG AA-compliant visual hierarchy without split-brain styling.

---

## 🛠️ Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Zustand, Lucide React, React Hot Toast.
- **Backend**: Node.js, Express.js, TypeScript, REST API architecture.
- **Data Persistence**: Atomic local JSON file storage by default, with optional MongoDB Native Driver support and pre-seeded sample workspace data.
- **Testing**: `node:test` and `node:assert/strict` with `tsx --test`.

---

## 📁 Project Structure

```
├── data/
│   └── database.json          # Persistent file store with seed data
├── server/
│   ├── routes/
│   │   ├── auth.ts            # Auth, login, register, profile
│   │   ├── projects.ts        # Projects CRUD & team members
│   │   ├── tasks.ts           # Tasks CRUD & Kanban batch moves
│   │   ├── comments.ts        # Comments & task discussions
│   │   ├── notifications.ts   # In-app notifications
│   │   └── dashboard.ts       # Analytics calculations
│   ├── auth.ts                # JWT authentication middleware & RBAC
│   └── db.ts                  # Persistent data models & seed engine
├── src/
│   ├── assets/                # Generated team profile avatars
│   ├── components/
│   │   ├── Avatar.tsx         # Resilient avatar with fallback initials
│   │   ├── Sidebar.tsx        # Collapsible responsive SaaS sidebar
│   │   ├── TopBar.tsx         # Top bar contract with search & notifs
│   │   ├── DashboardView.tsx  # Overview metrics & deadlines
│   │   ├── KanbanBoardView.tsx# 4-column drag-and-drop board
│   │   ├── ProjectsView.tsx   # Project cards & progress
│   │   ├── TasksListView.tsx  # Searchable & sortable data table
│   │   ├── TeamView.tsx       # Team directory & member invites
│   │   ├── ProfileView.tsx    # User settings & password change
│   │   ├── SettingsView.tsx   # Workspace preferences & seed restore
│   │   ├── TaskDetailModal.tsx# Task editor & comments thread
│   │   ├── NewTaskModal.tsx   # Task creation modal
│   │   ├── NewProjectModal.tsx# Project creation modal
│   │   └── AuthModal.tsx      # Sign in and member registration
│   ├── lib/
│   │   └── api.ts             # Typed REST API client
│   ├── store/
│   │   └── useStore.ts        # Zustand global store
│   ├── types/
│   │   └── index.ts           # TypeScript interfaces
│   ├── utils/
│   │   ├── taskCalculations.ts     # Pure business logic
│   │   └── taskCalculations.test.ts# Fast unit tests
│   ├── App.tsx                # Main application frame
│   ├── main.tsx               # Client entry point
│   └── index.css              # Tailwind v4 custom theme
├── server.ts                  # Full-stack Express server
└── package.json
```

---

## 🔌 REST API Documentation

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/login` | Authenticate user & get JWT token | No |
| POST | `/api/auth/logout` | Clear auth cookie | Yes |
| GET | `/api/auth/me` | Current user profile | Yes |
| GET | `/api/auth/users` | List all team members | Yes |
| PATCH | `/api/auth/profile` | Update user details | Yes |
| PATCH | `/api/auth/password` | Change user password | Yes |
| GET | `/api/projects` | List accessible projects | Yes |
| POST | `/api/projects` | Create a new project | Yes |
| GET | `/api/projects/:id` | Get project details | Yes |
| PATCH | `/api/projects/:id` | Update project (owner/admin) | Yes |
| DELETE | `/api/projects/:id` | Delete project & tasks | Yes |
| POST | `/api/projects/:id/members` | Add project member | Yes |
| DELETE | `/api/projects/:id/members/:userId` | Remove project member | Yes |
| GET | `/api/tasks` | List tasks (query filters) | Yes |
| POST | `/api/tasks` | Create task | Yes |
| GET | `/api/tasks/:id` | Get single task | Yes |
| PATCH | `/api/tasks/:id` | Update task fields / column status | Yes |
| DELETE | `/api/tasks/:id` | Delete task | Yes |
| GET | `/api/comments/task/:taskId`| List comments for task | Yes |
| POST | `/api/comments/task/:taskId`| Post new comment | Yes |
| DELETE | `/api/comments/:id` | Delete comment | Yes |
| GET | `/api/notifications` | List user notifications | Yes |
| PATCH | `/api/notifications/:id/read` | Mark notification read | Yes |
| PATCH | `/api/notifications/read-all` | Mark all notifications read | Yes |
| GET | `/api/dashboard/stats` | Calculate metrics & analytics | Yes |

---

## 💻 Local Development

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and set unique random values for both `AUTH_SECRET` and `BETTER_AUTH_SECRET`; set `BETTER_AUTH_URL` to the API origin. Configure `MONGODB_URI` and `MONGODB_DB_NAME` for MongoDB. Set `MONGODB_REPLICA_SET=true` for Atlas/replica sets (enables adapter transactions); leave it false for a standalone MongoDB server. Better Auth creates its collections automatically; no schema migration command is required. Before the first startup or the one-time legacy database migration, set `TASKFLOW_SEED_PASSWORD` if you need to sign in as a pre-seeded account; never use a shared or public password. Legacy demo credentials are reset during migration.

3. Run unit tests:
```bash
npm test
```

4. Start full-stack development server:
```bash
npm run dev
```
Navigate to `http://localhost:3000`.

---

## 🚢 Deployment Guide

### Deployment
Deploy the full-stack Node.js service to a persistent Node host. Configure unique `AUTH_SECRET` and `BETTER_AUTH_SECRET` values, `BETTER_AUTH_URL`, and optionally `MONGODB_URI`, `MONGODB_DB_NAME`, and `MONGODB_REPLICA_SET`. If MongoDB is omitted, application data stores in `data/database.json`; the deployment must preserve that directory across restarts. Frontend and API are served from the same origin.
