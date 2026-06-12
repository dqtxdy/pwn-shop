import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';

const root = process.cwd();
const ignoredDirs = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
  '.local-object-storage',
  'lib'
]);

const checks = [
  {
    name: 'No file:// documentation links',
    pattern: /file:\/\//,
    include: (file) => /\.(md|txt)$/i.test(file)
  },
  {
    name: 'No loose wallet action arrays in app code',
    pattern: /actions\??:\s*any\[\]/,
    include: (file) => file.startsWith('apps/') && /\.(ts|tsx)$/i.test(file)
  },
  {
    name: 'No browser Math.random workflow IDs or tx hashes',
    pattern: /Math\.random/,
    include: (file) => file.startsWith('apps/web/src/') && /\.(ts|tsx)$/i.test(file)
  },
  {
    name: 'No fake physical appraisal IPFS URI',
    pattern: /mock-physical|ipfs:\/\/mock/,
    include: (file) => file.startsWith('apps/') && /\.(ts|tsx)$/i.test(file)
  }
];

async function walk(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(absolutePath, files);
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files;
}

const files = await walk(root);
const failures = [];

for (const absolutePath of files) {
  const relativePath = path.relative(root, absolutePath);
  const info = await stat(absolutePath);
  if (info.size > 1024 * 1024) continue;

  const content = await readFile(absolutePath, 'utf8').catch(() => '');
  for (const check of checks) {
    if (check.include(relativePath) && check.pattern.test(content)) {
      failures.push(`${check.name}: ${relativePath}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Readiness check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Readiness check passed.');
