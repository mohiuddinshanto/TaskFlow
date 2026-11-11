import 'dotenv/config';
import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import { closeMongo, flushMongoWrites, initDatabase } from './server/db';
import { authRouter } from './server/routes/auth';
import { projectsRouter } from './server/routes/projects';
import { tasksRouter } from './server/routes/tasks';
import { commentsRouter } from './server/routes/comments';
import { notificationsRouter } from './server/routes/notifications';
import { dashboardRouter } from './server/routes/dashboard';
import { toNodeHandler } from 'better-auth/node';
import { auth, connectAuthMongo } from './src/lib/auth';
import { rateLimit } from './server/rateLimit';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Apply rate limiting to auth sign-in and sign-up routes (before Better Auth handler).
// 10 attempts per 15 minutes per IP per path.
const authRateLimit = rateLimit(10, 15 * 60 * 1000);
app.all('/api/auth/sign-in/*', authRateLimit);
app.all('/api/auth/sign-up/*', authRateLimit);

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

// Complete MongoDB writes before reporting a successful API mutation.
app.use((req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (req.method === 'GET' || req.method === 'HEAD') return sendJson(body);
    void flushMongoWrites().then(() => sendJson(body)).catch((error: unknown) => {
      console.error('[Database] Mutation failed:', error instanceof Error ? error.message : 'unknown error');
      res.status(500);
      sendJson({ error: 'The database could not save this change.' });
    });
    return res;
  }) as typeof res.json;
  next();
});

// Mount API routes
app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/dashboard', dashboardRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

let httpServer: ReturnType<typeof app.listen> | undefined;
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
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    if (typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.too.large') {
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

  httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`TaskFlow Server running on http://0.0.0.0:${PORT}`);
  });
}

async function shutdown(signal: string) {
  console.log(`[Server] ${signal} received; closing gracefully.`);
  try {
    await flushMongoWrites();
    if (httpServer) await new Promise<void>((resolve, reject) => httpServer!.close((error) => error ? reject(error) : resolve()));
    await closeMongo();
    process.exit(0);
  } catch (error) {
    console.error('[Server] Graceful shutdown failed:', error instanceof Error ? error.message : 'unknown error');
    process.exit(1);
  }
}

process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });

startServer().catch((err) => {
  const message = err instanceof Error ? err.message : 'Unknown startup error.';
  console.error('Failed to start server:', message);
  void closeMongo();
  process.exit(1);
});
