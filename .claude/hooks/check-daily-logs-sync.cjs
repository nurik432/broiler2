// PostToolUse hook (Write|Edit): warns if a file writes to daily_logs without
// calling syncSummaryBatchLog afterward (see CLAUDE.md "Summary batch sync").
const fs = require('fs');

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

  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    process.exit(0);
  }

  const writesDailyLogs =
    /from\(\s*['"]daily_logs['"]\s*\)[\s\S]{0,80}\.(insert|upsert|update)\s*\(/.test(content);
  if (!writesDailyLogs) process.exit(0);

  const callsSync = /syncSummaryBatchLog\s*\(/.test(content);
  if (callsSync) process.exit(0);

  console.log(
    JSON.stringify({
      systemMessage: `Reminder: ${file} writes to daily_logs but doesn't appear to call syncSummaryBatchLog(logDate, userId). Per CLAUDE.md, any daily_logs write must sync the summary batch afterward or is_summary data will drift.`,
    })
  );
  process.exit(0);
});
