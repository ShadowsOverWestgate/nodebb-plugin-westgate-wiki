import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirectories = new Set(['.git', '.worktrees', 'node_modules']);
const jsFilePattern = /\.(?:cjs|mjs|js)$/;
const testFilePattern = /\.test\.(?:cjs|mjs|js)$/;

async function discoverFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (!ignoredDirectories.has(entry.name)) {
				files.push(...await discoverFiles(path.join(directory, entry.name)));
			}
		} else if (entry.isFile() && jsFilePattern.test(entry.name)) {
			files.push(path.join(directory, entry.name));
		}
	}

	return files;
}

function runNode(args) {
	const result = spawnSync(process.execPath, args, {
		cwd: rootDir,
		stdio: 'inherit',
	});

	if (result.error) {
		throw result.error;
	}

	return result.status ?? 1;
}

const jsFiles = (await discoverFiles(rootDir)).sort();
for (const file of jsFiles) {
	const status = runNode(['--check', path.relative(rootDir, file)]);
	if (status !== 0) {
		process.exit(status);
	}
}

const testFiles = jsFiles
	.filter(file => file.startsWith(path.join(rootDir, 'tests')) && testFilePattern.test(file))
	.map(file => path.relative(rootDir, file));

if (!testFiles.length) {
	console.error('No test files found.');
	process.exit(1);
}

console.log(`Syntax check passed for ${jsFiles.length} files.`);

const testStatus = runNode(['--test', ...testFiles]);
process.exit(testStatus);
