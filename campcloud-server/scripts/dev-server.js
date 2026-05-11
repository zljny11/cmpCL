const { spawn } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const tscBin = path.join(projectRoot, 'node_modules', '.bin', 'tsc');
const serverEntry = path.join(projectRoot, 'dist', 'src', 'main.js');
const inspectEnabled = process.argv.includes('--inspect');

let serverProcess = null;
let compileSucceeded = false;
let shuttingDown = false;
let restartTimer = null;

function stopServer() {
  if (!serverProcess) {
    return;
  }

  serverProcess.kill('SIGTERM');
  serverProcess = null;
}

function startServer() {
  stopServer();

  const nodeArgs = [];
  if (inspectEnabled) {
    nodeArgs.push('--inspect');
  }
  nodeArgs.push(serverEntry);

  serverProcess = spawn(process.execPath, nodeArgs, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });

  serverProcess.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    if (signal !== 'SIGTERM') {
      console.error(`[dev-server] app exited with code=${code} signal=${signal}`);
    }
    serverProcess = null;
  });
}

function scheduleRestart() {
  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    startServer();
  }, 300);
}

function handleCompilerOutput(chunk) {
  const text = chunk.toString();
  process.stdout.write(text);

  if (text.includes('Found 0 errors. Watching for file changes.')) {
    compileSucceeded = true;
    scheduleRestart();
  }
}

function handleCompilerError(chunk) {
  process.stderr.write(chunk.toString());
}

function shutdown(code = 0) {
  shuttingDown = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  stopServer();
  watcher.kill('SIGTERM');
  process.exit(code);
}

const watcher = spawn(
  tscBin,
  ['-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput', '--pretty', 'false'],
  {
    cwd: projectRoot,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  },
);

watcher.stdout.on('data', handleCompilerOutput);
watcher.stderr.on('data', handleCompilerError);

watcher.on('exit', (code, signal) => {
  if (shuttingDown) {
    return;
  }

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  stopServer();
  if (!compileSucceeded) {
    console.error(`[dev-server] compiler exited before a successful build, code=${code} signal=${signal}`);
  }
  process.exit(code ?? 1);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
