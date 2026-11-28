import { Router } from 'express';
import { DEMO_EMAIL, DEMO_PASSWORD, prepareDemoWorkspace } from '../demo';

export const demoRouter = Router();

// Public by design: this endpoint provisions the shared, disposable demo workspace.
demoRouter.post('/prepare', async (_req, res) => {
  try {
    await prepareDemoWorkspace();
    res.json({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  } catch {
    res.status(503).json({ error: 'Demo login is temporarily unavailable. Please try again.' });
  }
});
