/**
 * Copy diff2html bundle files to media folder for extension packaging
 */
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'node_modules', 'diff2html', 'bundles');
const destDir = path.join(__dirname, '..', 'media', 'diff2html');

const filesToCopy = [
    { src: 'js/diff2html.min.js', dest: 'js/diff2html.min.js' },
    { src: 'css/diff2html.min.css', dest: 'css/diff2html.min.css' }
];

// Check if source directory exists
if (!fs.existsSync(srcDir)) {
    console.error('Error: diff2html bundles not found at', srcDir);
    console.error('Please run "npm install" first.');
    process.exit(1);
}

// Copy each file
for (const file of filesToCopy) {
    const srcPath = path.join(srcDir, file.src);
    const destPath = path.join(destDir, file.dest);
    
    // Check if source file exists
    if (!fs.existsSync(srcPath)) {
        console.error('Error: Source file not found:', srcPath);
        process.exit(1);
    }
    
    // Create destination directory if it doesn't exist
    const destDirPath = path.dirname(destPath);
    fs.mkdirSync(destDirPath, { recursive: true });
    
    // Copy the file
    fs.copyFileSync(srcPath, destPath);
    console.log('Copied:', file.src, '->', path.relative(path.join(__dirname, '..'), destPath));
}

console.log('Assets copied successfully!');
