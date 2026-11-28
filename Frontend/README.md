# TaskFlow

**Plan work, collaborate with your team, and track every task.**

TaskFlow is a full-stack project and task management application. Create projects, assign tasks, set priorities and deadlines, follow work on a Kanban board, and discuss tasks with your team. It was built for CodeAlpha's Full Stack Development Internship Task 3.

## Features

- Review project and task progress, deadlines, and overdue work from the dashboard.
- Create, edit, and delete projects and tasks; assign work to team members.
- Move tasks across the **To Do → In Progress → In Review → Completed** Kanban board with drag and drop.
- Search and filter tasks in the task list.
- Coordinate work with comments, notifications, priorities, due dates, and labels.
- Manage profiles, project membership, and role-based access.
- Use a responsive interface with light and dark themes.

## Technology stack

| Area | Tools |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4 |
| UI and state | Zustand, Motion, Lucide React, React Hot Toast |
| Backend | Node.js, Express, TypeScript |
| Authentication | Better Auth |
| Database | MongoDB Native Driver and Better Auth MongoDB adapter |

## Run locally

### 1. Prerequisites

- Node.js **20.19+** or **22.12+**, with npm.
- A running MongoDB database, either a local MongoDB server or MongoDB Atlas.
- The application source code and `package.json` are in this repository's `Frontend/` directory.

Check that Node.js and npm are installed:

```bash
node --version
npm --version
```

### 2. Install dependencies

From the repository root, enter the application directory and install its dependencies:

```bash
cd Frontend
npm install
```

### 3. Prepare MongoDB

**Local MongoDB:** Install and start the MongoDB server. The default local connection string is `mongodb://127.0.0.1:27017`. On Windows, check that the MongoDB service is running in the Services app. On Linux or macOS, start the service according to your MongoDB installation.

**MongoDB Atlas:** Create a database cluster and copy its connection string. Add your IP address under Atlas Network Access and provide a database user's credentials. Special characters in the connection string password may need URL encoding. Atlas normally uses a replica set.

### 4. Create the environment file

From inside `Frontend/`, copy `.env.example` to `.env`:

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

**macOS/Linux:**

```bash
cp .env.example .env
```

Open `.env` and set the following values:

```dotenv
PORT=3000
NODE_ENV=development
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=replace-with-a-long-unique-secret
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=taskflow_db
MONGODB_REPLICA_SET=false
```

Use your own secret for `BETTER_AUTH_SECRET`. You can generate one with Node.js:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

For Atlas, set `MONGODB_URI` to your Atlas connection string and set `MONGODB_REPLICA_SET=true`. For a standalone local MongoDB server, keep `MONGODB_REPLICA_SET=false`. The server will not start without `BETTER_AUTH_SECRET` (or `AUTH_SECRET`). The `.env` file contains credentials and secrets; do not commit it. It is excluded by `.gitignore`.

### 5. Start the development server

Run this command from the `Frontend/` directory:

```bash
npm run dev
```

When the terminal reports that MongoDB connected successfully, open [http://localhost:3000](http://localhost:3000) in your browser. The development server runs the React frontend and Express API on the same origin; you do not need to start them separately. A new database starts without projects or tasks, so create an account and then create a project to get started.

Press **Ctrl+C** in the terminal to stop the server. If you change `PORT`, open that port in your browser—for example, use `http://localhost:4000` when `PORT=4000`.

### 6. Run tests, type-check, and build

Run these commands from `Frontend/`:

```bash
npm test       # Run the test suite
npm run lint   # Check TypeScript types
npm run build  # Build the production frontend and server
npm start      # Start the production server (build first)
npm run clean  # Remove generated build output
```

Production also requires MongoDB and the required environment variables. Set `NODE_ENV=production`. After `npm run build`, `npm start` serves the frontend and API from the same Node.js service on `PORT` (defaults to 3000).

## Troubleshooting

| Issue | What to check |
| --- | --- |
| `MONGODB_URI is required` | Make sure `Frontend/.env` exists and `MONGODB_URI` is set. |
| MongoDB connection failed | Check that MongoDB is running, the URI and credentials are correct, and—if using Atlas—your IP is on the network allowlist. |
| `BETTER_AUTH_SECRET` error | Set `BETTER_AUTH_SECRET` or `AUTH_SECRET` in `.env`. |
| Port is already in use | Set another `PORT` in `.env` or stop the process using that port. |
| Changes to `.env` do not take effect | Stop the development server and run `npm run dev` again. |

## Repository structure

```text
.
└── Frontend/
    ├── README.md
    ├── server.ts             # Express server and API setup
    ├── server/               # Database, auth, permissions, and API routes
    ├── src/                  # React views, components, API helpers, and state
    ├── scripts/              # Development server and test runner
    ├── .env.example          # Environment variable template
    └── package.json          # Application scripts and dependencies
```

## API overview

The API is served from the same origin under `/api`. Main routes include:

| Route | Purpose |
| --- | --- |
| `/api/auth` | Sign-in, sign-up, and profile operations |
| `/api/projects` | Projects and membership |
| `/api/tasks` | Task creation, filtering, updates, and deletion |
| `/api/comments` | Task discussions |
| `/api/notifications` | Notifications and read status |
| `/api/dashboard/stats` | Dashboard metrics |
| `/api/health` | Server health check |

## Project status and limitations

This is an internship project. The current access model includes a legacy global admin role alongside project-level roles. Project members are added directly; there is no invitation acceptance or rejection workflow. Review and adapt the authorization model before using the application with a production team.

## License

This repository does not currently include a license file. Contact the project owner before redistributing or reusing it.
