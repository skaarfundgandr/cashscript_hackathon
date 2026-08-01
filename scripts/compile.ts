import { compileFile } from 'cashc';
import path from 'node:path';
import fs from 'node:fs';

const contractsDir = path.resolve(import.meta.dirname, '../contracts');
const artifactsDir = path.resolve(import.meta.dirname, '../artifacts');

if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

const files = fs.readdirSync(contractsDir).filter(f => f.endsWith('.cash'));

for (const file of files) {
  const inputPath = path.join(contractsDir, file);
  const outputPath = path.join(artifactsDir, file.replace('.cash', '.json'));
  const artifact = compileFile(inputPath);
  fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2));
  console.log(`Compiled ${file} -> ${path.basename(outputPath)}`);
}
