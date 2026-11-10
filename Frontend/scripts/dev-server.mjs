import { context } from 'esbuild';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outputDir = path.join(root, '.dev-build');
const outputFile = path.join(outputDir, 'server.js');
let server;
let stopping = false;

const buildContext = await context({
  entryPoints: ['server.ts'],
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  outfile: outputFile,
  logLevel: 'info',
  plugins: [{
    name: 'restart-taskflow-server',
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length || stopping) return;
        server?.kill();
        server = spawn(process.execPath, [outputFile], {
          cwd: root,
          env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' },
          stdio: 'inherit',
        });
      });
    },
  }],
});

async function stop() {
  if (stopping) return;
  stopping = true;
  server?.kill();
  await buildContext.dispose();
  rmSync(outputDir, { recursive: true, force: true });
}

process.on('SIGINT', () => void stop().then(() => process.exit(0)));
process.on('SIGTERM', () => void stop().then(() => process.exit(0)));
await buildContext.watch();
