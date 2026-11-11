# TaskFlow – Full Stack Task & Project Management Application

TaskFlow is a full-stack project and task management application inspired by Trello and Asana. Teams can organize projects, assign responsibilities, and track work on a Kanban board.

Developed for the **CodeAlpha Full Stack Development Internship – Task 3 (Project Management Tool)**.

---

## 🚀 Key Features

### 1. Robust Authentication & RBAC Authorization
- Better Auth cookie sessions with salted password hashing.
- Role-based Access Control (**Admin**, **Project Owner**, **Project Member**).
- Profile management with customizable job titles, departments, and password modification.
- Public registration creates a standard member account; project roles are assigned by the project Owner.

### 2. Comprehensive Analytics Dashboard
- Live metrics: Total Projects, Total Tasks, In Progress, Review, Completed, and Overdue tasks.
- Tabular figures (`tabular-nums`) with project and task completion rates.
- Priority and Status distribution breakdowns.
- Recent projects progress indicator and upcoming deadlines stream.

### 3. Interactive 4-Column Kanban Board
- Columns: **To Do**, **In Progress**, **In Review**, **Completed**.
- Smooth HTML5 Drag-and-Drop with instant state synchronization.
- Task movement saved to the backend through `PATCH /api/tasks/:id`.
- Task cards with priority badges (Urgent, High, Medium, Low), due date alerts, label tags, and assignee avatars.
- Quick mobile move selector for touch viewports.

### 4. Project Management
- Full Project CRUD: create, edit, delete (with confirmation modals), and lifecycle status updates.
- Project categories, customizable color accents, and timeline due dates.
- Owners and project Admins can add or remove project Members. Only the Owner can promote or demote project roles or transfer ownership.

### 5. Task Collaboration & Discussion Threads
- Task discussion comments with author profile attribution and timestamps.
- Author & Admin comment deletion authorization.
- Tag and label management.

### 6. In-App Notification System
- Notification popover with unread badge counts.
- Event triggers: task assignments, approaching deadlines, status transitions, and comments.
- Single and bulk mark-as-read actions.

### 7. Dual-Theme Support (Light & Dark Mode)
- Built with Tailwind CSS v4 `@custom-variant dark`.
- High contrast, WCAG AA-compliant visual hierarchy without split-brain styling.

---

## 🛠️ Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Zustand, Lucide React, React Hot Toast.
- **Backend**: Node.js, Express.js, TypeScript, REST API architecture.
- **Data Persistence**: MongoDB Native Driver. New databases start with no demo users, projects, or tasks.
- **Testing**: `node:test` and `node:assert/strict` with `tsx --test`.

---

## Frontend and Backend

This repository keeps the frontend and backend in one application folder named `Frontend`; they are not two separately started projects.

- **Frontend:** `src/` contains the React and TypeScript UI. `index.html` is the Vite entry page.
- **Backend:** `server.ts` starts the Express API. `server/` contains authentication, database, permissions, and API route code.
- **Development:** `npm run dev` builds/watches the Express server and serves the Vite frontend on the same origin at `http://localhost:3000`.
- **Production:** `npm run build` builds both the frontend assets and Express server; `npm start` runs the built full-stack app.

There is no separate frontend-only or backend-only start command in this setup. Start the full-stack app once and use the frontend in the browser; its API requests go to the Express backend automatically.

## Project Structure

```
├── data/
├── server/
│   ├── routes/
│   │   ├── auth.ts            # Auth, login, register, profile
│   │   ├── projects.ts        # Projects CRUD & team members
│   │   ├── tasks.ts           # Tasks CRUD & Kanban batch moves
│   │   ├── comments.ts        # Comments & task discussions
│   │   ├── notifications.ts   # In-app notifications
│   │   └── dashboard.ts       # Analytics calculations
│   ├── auth.ts                # JWT authentication middleware & RBAC
│   └── db.ts                  # MongoDB data access and permission rules
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
│   │   ├── SettingsView.tsx   # Workspace preferences and database status
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
| PATCH | `/api/projects/:id/members/:userId/role` | Owner changes a member role | Yes |
| POST | `/api/projects/:id/transfer-ownership` | Owner transfers project ownership | Yes |
| GET | `/api/tasks` | List tasks (search, status, priority, assignee, due-date, sort filters) | Yes |
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

### Project Permission Matrix

The current implementation still contains a legacy global `admin` user role alongside per-project **Owner**, **Admin**, and **Member** roles. This does not meet the requested project-scoped-only model and remains a production blocker. Project membership is currently added directly through `/api/projects/:id/members`; explicit invitation acceptance and rejection are not implemented yet. Do not treat direct member addition as an invitation workflow.

| Action | Legacy global Admin | Project Owner | Project Admin | Project Member | Outsider |
|---|---|---|---|---|---|
| View project and tasks | All projects | Own project | Member projects | Member projects | No |
| Add project members directly | Yes | Yes | Yes, as Member | No | No |
| Remove project members | Yes, except Owner | Yes, except Owner | Members only | No | No |
| Change a project role | Only when also the current Owner | Yes | No | No | No |
| Transfer ownership | Only when also the current Owner | Yes, to an existing member | No | No | No |
| Edit project settings / delete project | Yes | Yes | No | No | No |
| Create tasks | Yes | Yes | Yes | Yes | No |
| Edit task fields | Yes | Yes | Yes | Tasks they created or are assigned | No |
| Delete tasks | Yes | Yes | Tasks they created only | Tasks they created only | No |
| Change task status/order | Yes | Yes | Yes | Yes | No |

On ownership transfer, the selected current member becomes the sole Owner and the previous Owner becomes a project Admin. Role changes and transfers are Owner-only and produce notifications and activity records. The global Admin bypass and lack of invitation acceptance are known limitations; a project-scoped role migration is required before production.

Task due-date filters use `dueDateFilter=overdue|today|this_week|none|custom`. Custom ranges require both `dueDateFrom=YYYY-MM-DD` and `dueDateTo=YYYY-MM-DD`; endpoints are inclusive. `this_week` covers Monday through Sunday in UTC.

---

## Local Development

Run all commands from the `Frontend` folder (the folder containing this README and `package.json`). From the repository root in PowerShell:

```powershell
cd .\Frontend
```

1. Install dependencies:

```bash
npm install
```

2. Create `Frontend/.env` with `MONGODB_URI`, `MONGODB_DB_NAME`, and `BETTER_AUTH_SECRET` (or `AUTH_SECRET`). Use a MongoDB connection string for a dedicated database and a long random auth secret. Keep `BETTER_AUTH_URL=http://localhost:3000` for local development. Set `MONGODB_REPLICA_SET=true` for Atlas/replica sets; leave it false for a standalone MongoDB server. MongoDB is mandatory; the app exits if it cannot connect, and never falls back to local JSON storage. New databases start empty.

```powershell
New-Item -ItemType File .env
```

3. Start frontend and backend together:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser. The Express API is available under `/api`; Vite serves the frontend through the same development server.

4. Run unit tests:

```bash
npm test
```

5. Build and start the production version:

```bash
npm run build
npm start
```

## 🚢 Deployment Guide

### Deployment
Deploy the full-stack Node.js service to a persistent Node host. Configure `BETTER_AUTH_SECRET` (or `AUTH_SECRET`), `BETTER_AUTH_URL`, `MONGODB_URI`, and `MONGODB_DB_NAME`; set `MONGODB_REPLICA_SET` to match the deployment. Allow the host's egress IP in Atlas Network Access and ensure TCP port 27017 is reachable. MongoDB must be reachable before the service starts; there is no local-file persistence fallback. Frontend and API are served from the same origin. Invitation acceptance, project-scoped-only roles, and WebSocket updates remain incomplete; production readiness is blocked until those requirements and MongoDB persistence are verified.
