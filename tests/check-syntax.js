import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const baseDir = 'C:/Users/samir/.gemini/antigravity/scratch/snapkeep';

function checkDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        checkDirectory(fullPath);
      }
    } else if (entry.name.endsWith('.js')) {
      try {
        execSync(`node --check "${fullPath}"`);
        console.log(`[PASS] ${path.relative(baseDir, fullPath)}`);
      } catch (err) {
        console.error(`[FAIL] ${fullPath}`);
        process.exit(1);
      }
    }
  }
}

console.log('Verifying all JavaScript files for syntax errors...');
checkDirectory(baseDir);
console.log('All files verified successfully!');
