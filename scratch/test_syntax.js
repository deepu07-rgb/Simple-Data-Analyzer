const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'download', 'Simple-Data-Analyser.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Extract all <script> blocks (ignoring external ones)
const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let scripts = [];

while ((match = scriptRegex.exec(html)) !== null) {
  const content = match[1];
  // Ignore scripts that just load external files (have src) but don't contain inline code
  if (content.trim().length > 0) {
    scripts.push(content);
  }
}

console.log(`Found ${scripts.length} inline script block(s).`);

scripts.forEach((code, idx) => {
  console.log(`Validating script block #${idx + 1}...`);
  try {
    // Write code to a temp file and run node -c on it
    const tempFile = path.join(__dirname, `temp_script_${idx}.js`);
    fs.writeFileSync(tempFile, code, 'utf8');
    
    const { execSync } = require('child_process');
    try {
      execSync(`node -c "${tempFile}"`, { stdio: 'pipe' });
      console.log(`Script block #${idx + 1} is syntactically VALID.`);
      fs.unlinkSync(tempFile);
    } catch (err) {
      console.error(`Syntax error in script block #${idx + 1}:`);
      console.error(err.stderr.toString());
      fs.unlinkSync(tempFile);
      process.exit(1);
    }
  } catch (e) {
    console.error('Validation error:', e);
    process.exit(1);
  }
});
