#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, 'logs');

function viewLogs(date) {
  const logFile = date 
    ? path.join(logsDir, `frontend_${date}.log`)
    : getLatestLogFile();

  if (!fs.existsSync(logFile)) {
    console.log(`❌ Log file not found: ${logFile}`);
    listAvailableLogs();
    return;
  }

  console.log(`📋 Viewing logs from: ${path.basename(logFile)}`);
  console.log('━'.repeat(80));

  try {
    const logs = fs.readFileSync(logFile, 'utf8');
    if (logs.trim()) {
      console.log(logs);
    } else {
      console.log('📝 Log file is empty');
    }
  } catch (error) {
    console.error(`❌ Error reading log file: ${error.message}`);
  }
}

function getLatestLogFile() {
  if (!fs.existsSync(logsDir)) {
    console.log(`❌ Logs directory not found: ${logsDir}`);
    return null;
  }

  const files = fs.readdirSync(logsDir)
    .filter(file => file.startsWith('frontend_') && file.endsWith('.log'))
    .sort()
    .reverse();

  return files.length > 0 ? path.join(logsDir, files[0]) : null;
}

function listAvailableLogs() {
  if (!fs.existsSync(logsDir)) {
    console.log(`📁 Logs directory not found: ${logsDir}`);
    return;
  }

  const files = fs.readdirSync(logsDir)
    .filter(file => file.startsWith('frontend_') && file.endsWith('.log'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.log('📁 No log files found');
    return;
  }

  console.log('\n📋 Available log files:');
  files.forEach(file => {
    const filePath = path.join(logsDir, file);
    const stats = fs.statSync(filePath);
    const size = (stats.size / 1024).toFixed(1);
    console.log(`  📄 ${file} (${size} KB)`);
  });
  
  console.log('\n💡 Usage:');
  console.log('  node view-logs.js          # View latest logs');
  console.log('  node view-logs.js 2024-01-15  # View specific date');
  console.log('  node view-logs.js --list   # List all log files');
}

function tailLogs(file) {
  if (!fs.existsSync(file)) {
    console.log(`❌ Log file not found: ${file}`);
    return;
  }

  console.log(`👀 Tailing logs from: ${path.basename(file)}`);
  console.log('   Press Ctrl+C to stop');
  console.log('━'.repeat(80));

  let lastSize = fs.statSync(file).size;
  let stream = fs.createReadStream(file, { start: lastSize });
  stream.pipe(process.stdout);

  // Watch for changes
  fs.watchFile(file, (curr, prev) => {
    if (curr.size > prev.size) {
      const newStream = fs.createReadStream(file, { start: prev.size });
      newStream.pipe(process.stdout);
    }
  });
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('📋 Frontend Log Viewer');
  console.log('');
  listAvailableLogs();
} else if (args.includes('--list') || args.includes('-l')) {
  listAvailableLogs();
} else if (args.includes('--tail') || args.includes('-t')) {
  const logFile = getLatestLogFile();
  if (logFile) {
    tailLogs(logFile);
  }
} else if (args.length > 0) {
  // Specific date requested
  viewLogs(args[0]);
} else {
  // View latest logs
  viewLogs();
}
