import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = dirname(currentFilePath);
const distEntryPath = resolve(currentDirPath, '../dist/index.js');

const source = await readFile(distEntryPath, 'utf8');
const rewritten = source.replace(`export * from './contracts';`, `export * from './contracts.js';`);

if (rewritten !== source) {
  await writeFile(distEntryPath, rewritten, 'utf8');
}
