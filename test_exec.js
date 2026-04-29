const { execFileSync } = require('child_process');
try {
  const out = execFileSync(process.execPath, ['-e', 'console.log("hello")'], { encoding: 'utf-8' });
  console.log('Output: ' + out);
} catch (e) {
  console.error('Error: ' + e.message);
}
