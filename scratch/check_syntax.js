const fs = require('fs');
const vm = require('vm');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'download', 'Simple-Data-Analyser.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Find the main script block starting at line 1473 (or after <script>)
const scriptStartIdx = html.indexOf('<script>', 500); // skip the CDN scripts at the top
const scriptEndIdx = html.lastIndexOf('</script>');

if (scriptStartIdx === -1 || scriptEndIdx === -1 || scriptEndIdx <= scriptStartIdx) {
  console.error('Could not find script block');
  process.exit(1);
}

const js = html.substring(scriptStartIdx + 8, scriptEndIdx);

try {
  new vm.Script(js);
  console.log('SUCCESS: No syntax errors found in the main script block.');
} catch (err) {
  console.error('SYNTAX ERROR FOUND:');
  console.error(err.stack);
  
  // Let's print the line of code that caused the issue
  // Node's Script syntax error stack trace gives us the line number relative to the script block
  const lines = js.split('\n');
  const match = err.stack.match(/evalmachine\.<anonymous>:(\d+)/);
  if (match) {
    const errLineNum = parseInt(match[1], 10);
    console.error(`Error is at JS line ${errLineNum} (HTML line ${1473 + errLineNum}):`);
    console.error('----------------------------------------');
    for (let i = Math.max(0, errLineNum - 5); i < Math.min(lines.length, errLineNum + 5); i++) {
      const marker = (i === errLineNum - 1) ? '>>> ' : '    ';
      console.error(`${marker}${1473 + i + 1}: ${lines[i]}`);
    }
    console.error('----------------------------------------');
  }
  process.exit(1);
}
