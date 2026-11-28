import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, '.test-build');
const relativeTests = ['src/utils/taskCalculations.test.ts', 'server/rbac.test.ts'];

try {
  await build({
    entryPoints: relativeTests,
    outbase: root,
    outdir: output,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  const testFiles = relativeTests.map((file) => path.join(output, file.replace(/\.ts$/, '.js')));
  const result = spawnSync(process.execPath, ['--test', ...testFiles], { cwd: root, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(output, { recursive: true, force: true });
}
