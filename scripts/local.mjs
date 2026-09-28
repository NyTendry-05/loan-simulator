import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, access, open, readdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

async function main() {
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'node-api/package.json'));
const { Client } = require('pg');
const local = join(root, '.local');
const stateFile = join(local, 'database.json');
const pgBin = process.env.POSTGRES_BIN ?? join(root, '.tools/postgres/bin');
const executable = name => join(pgBin, name + (process.platform === 'win32' ? '.exe' : ''));
const command = process.argv[2] ?? 'start';
if (!['start', 'database', 'stop', 'stop-db', 'restart'].includes(command)) throw new Error('Use start, database, stop, stop-db, or restart');
const secret = () => randomBytes(32).toString('base64url');
await mkdir(local, { recursive: true });

async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function run(program, args, options = {}) {
  const child = spawn(program, args, { cwd: root, windowsHide: true, stdio: 'inherit', ...options });
  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(program + ' exited with ' + code)));
  });
}
async function availablePort(preferred) {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(preferred, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function envFile(path, additions) {
  const old = await exists(path) ? await readFile(path, 'utf8') : '';
  const values = Object.fromEntries(old.split(/\r?\n/).filter(line => /^[A-Z][A-Z0-9_]*=/.test(line)).map(line => {
    const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)];
  }));
  for (const [key, value] of Object.entries(additions)) if (!values[key]) values[key] = String(value);
  await writeFile(path, Object.entries(values).map(([key, value]) => key + '=' + value).join('\n') + '\n', { mode: 0o600 });
  return values;
}
async function background(program, args, name, env) {
  if (process.platform === 'win32') {
    // A hidden real console is inherited by PostgreSQL workers. Launching a
    // detached console-less postmaster lets its workers open visible consoles.
    const quote = value => '"' + String(value).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1') + '"';
    const launch = { program, arguments: args.map(quote).join(' '), cwd: root,
      stdout: join(local, name + '.log'), stderr: join(local, name + '.error.log'), pidFile: join(local, name + '.pid') };
    await run('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command',
        '$ErrorActionPreference = "Stop"; $launch = $env:NYT_LAUNCH | ConvertFrom-Json; $child = Start-Process -FilePath $launch.program -ArgumentList $launch.arguments -WorkingDirectory $launch.cwd -WindowStyle Hidden -RedirectStandardOutput $launch.stdout -RedirectStandardError $launch.stderr -PassThru; $child.Id | Set-Content -LiteralPath $launch.pidFile'],
      { stdio: 'ignore', env: { ...process.env, ...env, NYT_LAUNCH: JSON.stringify(launch) } });
    const pid = Number((await readFile(launch.pidFile, 'utf8')).trim());
    if (!Number.isInteger(pid) || pid < 1) throw new Error('Could not start ' + name);
    return pid;
  }
  const log = await open(join(local, name + '.log'), 'a');
  const child = spawn(program, args, { cwd: root, env: { ...process.env, ...env }, windowsHide: true,
    detached: true, stdio: ['ignore', log.fd, log.fd] });
  child.unref();
  await log.close();
  return child.pid;
}
async function waitFor(url, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await delay(500);
  }
  throw new Error('Startup timed out. Inspect .local service logs.');
}
async function stopManaged(pid, expectedCommand) {
  if (!Number.isInteger(pid) || pid < 1) throw new Error('Invalid managed process id');
  if (process.platform === 'win32') {
    await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$managed = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $env:NYT_MANAGED_PID); if ($managed) { if (-not $managed.CommandLine.Contains($env:NYT_EXPECTED_COMMAND)) { throw "Process identity changed; refusing to stop" }; Stop-Process -Id ([int]$env:NYT_MANAGED_PID) }'],
      { windowsHide: true, env: { ...process.env, NYT_MANAGED_PID: String(pid), NYT_EXPECTED_COMMAND: expectedCommand } });
  } else {
    try {
      const commandLine = await readFile('/proc/' + pid + '/cmdline', 'utf8');
      if (!commandLine.includes(expectedCommand)) throw new Error('Process identity changed; refusing to stop');
      process.kill(pid, 'SIGTERM');
    } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error; }
  }
}

let state;
if (await exists(stateFile)) state = JSON.parse(await readFile(stateFile, 'utf8'));
else {
  await access(executable('initdb'));
  let port;
  try { port = await availablePort(Number(process.env.LOCAL_DATABASE_PORT ?? 5432)); }
  catch { port = await availablePort(0); }
  state = { host: '127.0.0.1', port, owner: 'nyt_owner', ownerPassword: secret(),
    database: 'nyt_loans', user: 'nyt_app', password: secret() };
  await writeFile(stateFile, JSON.stringify(state, null, 2), { mode: 0o600, flag: 'wx' });
}
const data = join(local, 'postgres');
const servicesFile = join(local, 'services.json');
if (['stop', 'restart'].includes(command) && await exists(servicesFile)) {
  const managed = JSON.parse(await readFile(servicesFile, 'utf8'));
  await stopManaged(managed.portalPid, join(root, 'node-api/src/server.js'));
  await stopManaged(managed.backendPid, join(root, 'target/nyt-0.1.0.jar'));
}
if (command === 'stop') {
  await run(executable('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop']);
  console.log('Local services stopped. Database files and credentials are preserved.');
  return;
}
if (command === 'stop-db') {
  await run(executable('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop']);
  return;
}
if (!(await exists(join(data, 'PG_VERSION')))) {
  const passwordFile = join(local, 'database-owner.password');
  await writeFile(passwordFile, state.ownerPassword, { mode: 0o600 });
  await run(executable('initdb'), ['-D', data, '-U', state.owner, '--pwfile=' + passwordFile,
    '-A', 'scram-sha-256', '--encoding=UTF8', '--locale=C']);
}
let databaseRunning = false;
const probe = new Client({ host: state.host, port: state.port, database: 'postgres', user: state.owner, password: state.ownerPassword, connectionTimeoutMillis: 2000 });
try { await probe.connect(); databaseRunning = true; } catch {} finally { await probe.end(); }
if (!databaseRunning) {
  await availablePort(state.port);
  await background(executable('postgres'), ['-D', data, '-h', state.host, '-p', String(state.port)], 'postgres', {});
}
const owner = new Client({ host: state.host, port: state.port, database: 'postgres', user: state.owner, password: state.ownerPassword });
for (let attempt = 0; attempt < 40; attempt++) {
  const client = new Client({ host: state.host, port: state.port, database: 'postgres', user: state.owner, password: state.ownerPassword });
  try { await client.connect(); await client.end(); break; } catch { await client.end(); await delay(250); }
}
await owner.connect();
try {
  if (!(await owner.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [state.user])).rowCount) {
    // Names are generated constants; the generated password is strictly base64url.
    if (!/^[a-z_]+$/.test(state.user) || !/^[A-Za-z0-9_-]+$/.test(state.password)) throw new Error('Invalid database configuration');
    await owner.query('CREATE ROLE "' + state.user + '" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD \'' + state.password + '\'');
  }
  if (!(await owner.query('SELECT 1 FROM pg_database WHERE datname = $1', [state.database])).rowCount) {
    if (!/^[a-z_]+$/.test(state.database)) throw new Error('Invalid database name');
    await owner.query('CREATE DATABASE "' + state.database + '" OWNER "' + state.user + '"');
  }
  await owner.query('REVOKE CONNECT ON DATABASE "' + state.database + '" FROM PUBLIC');
  await owner.query('GRANT CONNECT ON DATABASE "' + state.database + '" TO "' + state.user + '"');
} finally { await owner.end(); }
const bootstrapPath = join(local, 'administrator.json');
if (!(await exists(bootstrapPath))) {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_NAME) throw new Error('Set ADMIN_EMAIL and ADMIN_NAME for the first setup');
  await writeFile(bootstrapPath, JSON.stringify({ email: process.env.ADMIN_EMAIL, name: process.env.ADMIN_NAME, password: secret() }, null, 2),
    { mode: 0o600, flag: 'wx' });
}
const admin = JSON.parse(await readFile(bootstrapPath, 'utf8'));
const backendEnv = await envFile(join(root, '.env'), {
  SPRING_PROFILES_ACTIVE: 'local', DATABASE_URL: 'jdbc:postgresql://' + state.host + ':' + state.port + '/' + state.database,
  DATABASE_USER: state.user, DATABASE_PASSWORD: state.password, PORT: 8080, DEBUG: 'false',
  ENCRYPTION_ACTIVE_KEY_ID: 'primary', ENCRYPTION_KEYS: 'primary:' + randomBytes(32).toString('base64'),
  AUTH_LOOKUP_KEY: randomBytes(32).toString('base64'), BOOTSTRAP_ADMIN_EMAIL: admin.email,
  BOOTSTRAP_ADMIN_NAME: admin.name, BOOTSTRAP_ADMIN_PASSWORD: admin.password,
});
const portalEnv = await envFile(join(root, 'node-api/.env'), {
  LOAN_SERVICE_URL: 'http://127.0.0.1:' + backendEnv.PORT, HOST: '127.0.0.1', PORT: 3000,
  PUBLIC_ORIGIN: 'http://127.0.0.1:3000', CORS_ORIGINS: '',
});
if (command === 'database') { console.log('Persistent PostgreSQL is ready: ' + state.database + ' on ' + state.host + ':' + state.port); return; }
if (command === 'start' && await exists(servicesFile)) {
  const managed = JSON.parse(await readFile(servicesFile, 'utf8'));
  try {
    await waitFor('http://127.0.0.1:' + managed.backendPort + '/health', 1000);
    await waitFor(managed.portalOrigin + '/health', 1000);
    console.log('Portal is already running at ' + managed.portalOrigin);
    return;
  } catch { /* Start only after the configured ports have been checked below. */ }
}
const javaDirs = await exists(join(root, '.tools/java21')) ? await readdir(join(root, '.tools/java21')) : [];
const javaHome = process.env.LOCAL_JAVA_HOME ?? (javaDirs[0] ? join(root, '.tools/java21', javaDirs[0]) : process.env.JAVA_HOME);
if (!javaHome) throw new Error('Set JAVA_HOME to Java 21');
await availablePort(Number(backendEnv.PORT));
await availablePort(Number(portalEnv.PORT));
const backendPid = await background(join(javaHome, 'bin/java' + (process.platform === 'win32' ? '.exe' : '')),
  ['-jar', join(root, 'target/nyt-0.1.0.jar')], 'backend', backendEnv);
await waitFor('http://127.0.0.1:' + backendEnv.PORT + '/health');
const portalPid = await background(process.execPath, [join(root, 'node-api/src/server.js')], 'portal', portalEnv);
await waitFor(portalEnv.PUBLIC_ORIGIN + '/health');
await writeFile(join(local, 'services.json'), JSON.stringify({ backendPid, portalPid, backendPort: backendEnv.PORT, portalOrigin: portalEnv.PUBLIC_ORIGIN }, null, 2));
console.log('Portal ready at ' + portalEnv.PUBLIC_ORIGIN);
console.log('Administrator credentials: .local/administrator.json (private, excluded from source control)');
}
await main().catch(error => { console.error(error.message); process.exitCode = 1; });
