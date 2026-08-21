// PostToolUse hook (Write|Edit): lints the just-edited .js/.jsx file with ESLint.
const { execFileSync } = require('child_process');

let data = '';
process.stdin.on('data', (c) => (data += c));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(data);
  } catch {
    process.exit(0);
  }

  const file = (input.tool_input && input.tool_input.file_path) || '';
  if (!/\.(js|jsx)$/.test(file)) process.exit(0);

  try {
    execFileSync('npx', ['eslint', file], { stdio: 'inherit' });
  } catch {
    // eslint exits non-zero on lint errors; the output is already printed via stdio:inherit
  }
  process.exit(0);
});
