/**
 * Script to copy diff2html assets from node_modules to media folder
 * This is necessary because .vscodeignore excludes node_modules but we need
 * the diff2html bundles for the webview to work at runtime.
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'node_modules', 'diff2html', 'bundles');
const targetDir = path.join(rootDir, 'media', 'diff2html');

const filesToCopy = [
    { from: 'css/diff2html.min.css', to: 'css/diff2html.min.css' },
    { from: 'js/diff2html.min.js', to: 'js/diff2html.min.js' }
];

// Check if source directory exists
if (!fs.existsSync(sourceDir)) {
    console.error('Error: diff2html bundles not found. Please run npm install first.');
    process.exit(1);
}

// Create target directories
fs.mkdirSync(path.join(targetDir, 'css'), { recursive: true });
fs.mkdirSync(path.join(targetDir, 'js'), { recursive: true });

// Copy files
for (const file of filesToCopy) {
    const sourcePath = path.join(sourceDir, file.from);
    const targetPath = path.join(targetDir, file.to);
    
    if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`Copied: ${file.from}`);
    } else {
        console.error(`Warning: Source file not found: ${sourcePath}`);
    }
}

console.log('Asset copy complete.');
