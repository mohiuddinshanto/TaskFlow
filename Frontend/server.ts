import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { initDatabase } from './server/db';
import { authRouter } from './server/routes/auth';
import { projectsRouter } from './server/routes/projects';
import { tasksRouter } from './server/routes/tasks';
import { commentsRouter } from './server/routes/comments';
import { notificationsRouter } from './server/routes/notifications';
import { dashboardRouter } from './server/routes/dashboard';
import { toNodeHandler } from 'better-auth/node';
import { auth, connectAuthMongo } from './src/lib/auth';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Better Auth must receive the untouched request stream, before body parsers.
const betterAuthHandler = toNodeHandler(auth);
app.all('/api/auth/*', (req, res, next) => {
  if (/^\/api\/auth\/(me|users|profile|password)(\/|$)/.test(req.path)) {
    next();
    return;
  }
  void betterAuthHandler(req, res);
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Mount API routes
app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/dashboard', dashboardRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

async function startServer() {
  // Finish loading persistent data before accepting API traffic.
  await initDatabase();
  await connectAuthMongo();
  if (!isProd) {
    // In development: mount Vite dev server as middleware
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production: serve static build files
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ error: 'Request body is too large.' });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'Request body must contain valid JSON.' });
      return;
    }
    console.error('[HTTP] Unexpected request error:', err);
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TaskFlow Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
