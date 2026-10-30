/**
 * Corre las pruebas en vivo (*.live.test.ts) contra un backend-go real.
 *
 * 1. Compila backend-go a un ejecutable temporal.
 * 2. Lo levanta con tokens cortos sobre una base de PRUEBA. Corre desde una
 *    carpeta temporal para no leer backend-go/.env: siempre usa la base
 *    indicada, sin Redis (revocados en memoria) y con la simulación de micros
 *    (publica bus:update por el WebSocket). Al iniciar,
 *    el backend aplica las migraciones y crea los usuarios de prueba (seed).
 * 3. Espera a que /health responda y corre jest -c jest.live.config.js.
 * 4. Detiene el backend siempre (también con Ctrl+C).
 *
 * Uso (la base debe existir y ser de prueba, nunca transporte_db):
 *   LIVE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/transithub_live npm run test:live:backend
 *
 * Variables opcionales:
 *   LIVE_PORT                   Puerto del backend (3995)
 *   LIVE_JWT_ACCESS_EXPIRES_IN  Duración del access token ("5s")
 * Los argumentos extra pasan a Jest (ej. -t "refresh").
 */
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = join(mobileDir, '..', 'backend-go');
const PROTECTED_DATABASES = ['transporte_db'];

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

// ── Configuración ───────────────────────────────────────────────────────────
const databaseUrl = process.env.LIVE_DATABASE_URL;
if (!databaseUrl) {
  fail('Falta LIVE_DATABASE_URL: la URL de una base de PRUEBA (el backend le aplica migraciones y crea datos).');
}
let databaseName;
try {
  databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
} catch {
  fail('LIVE_DATABASE_URL no es una URL válida (ej. postgresql://usuario:clave@localhost:5432/transithub_live).');
}
if (!databaseName || PROTECTED_DATABASES.includes(databaseName)) {
  fail(`No se corren las pruebas en vivo contra "${databaseName || '(sin base)'}": usa una base de prueba.`);
}
const port = process.env.LIVE_PORT || '3995';
const accessTtl = process.env.LIVE_JWT_ACCESS_EXPIRES_IN || '5s';
const baseUrl = `http://127.0.0.1:${port}`;

const workDir = mkdtempSync(join(tmpdir(), 'transithub-live-'));
const serverBin = join(workDir, process.platform === 'win32' ? 'server.exe' : 'server');
const logPath = join(workDir, 'backend.log');
let server;
let log;
let keepWorkDir = false;

/** Detiene el backend y espera a que termine (Windows no borra un .exe en uso). */
async function cleanup() {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  }
  if (log) {
    await new Promise((resolve) => log.end(resolve));
  }
  if (!keepWorkDir) {
    rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
process.on('SIGINT', async () => {
  await cleanup();
  process.exit(130);
});

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      return false;
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return true;
      }
    } catch {
      // Todavía no escucha.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

// ── 1. Compilar ─────────────────────────────────────────────────────────────
console.log('▶ Compilando backend-go…');
const build = spawnSync('go', ['build', '-o', serverBin, './cmd/server'], { cwd: backendDir, stdio: 'inherit' });
if (build.status !== 0) {
  await cleanup();
  fail('No se pudo compilar backend-go (¿está Go instalado?).');
}

// ── 2. Levantar ─────────────────────────────────────────────────────────────
console.log(`▶ Levantando backend-go en ${baseUrl} (base "${databaseName}", access token de ${accessTtl})…`);
log = createWriteStream(logPath);
server = spawn(serverBin, [], {
  cwd: workDir,
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
    PORT: port,
    JWT_ACCESS_EXPIRES_IN: accessTtl,
    NODE_ENV: 'development',
    // La simulación mueve micros y las publica por el WebSocket (/ws), como
    // las ve el web: la usa la prueba en vivo del tiempo real.
    SIMULATION_ENABLED: 'true',
    REDIS_ADDR: '',
    ATTACHMENTS_DIR: join(workDir, 'attachments'),
    // Las pruebas inician sesión y renuevan tokens decenas de veces en segundos
    // (un usuario real renueva cada ~15 min) y no prueban los límites de
    // intentos: se suben para que no respondan 429 según el orden de las
    // pruebas. Los limitadores siguen activos; el 429 en la app se prueba en
    // las pruebas unitarias.
    RATE_LIMIT_AUTH_PER_MIN: '600',
    RATE_LIMIT_AUTH_BURST: '100',
    RATE_LIMIT_TOKEN_PER_MIN: '600',
    RATE_LIMIT_TOKEN_BURST: '100',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.pipe(log);
server.stderr.pipe(log);

let exitCode = 1;
try {
  if (!(await waitForHealth(60_000))) {
    keepWorkDir = true;
    throw new Error(`backend-go no respondió en /health. Revisa el log: ${logPath}`);
  }

  // ── 3. Pruebas ────────────────────────────────────────────────────────────
  console.log('▶ Corriendo las pruebas en vivo…\n');
  const jestBin = join(mobileDir, 'node_modules', 'jest', 'bin', 'jest.js');
  const jest = spawnSync(process.execPath, [jestBin, '-c', 'jest.live.config.js', ...process.argv.slice(2)], {
    cwd: mobileDir,
    stdio: 'inherit',
    env: { ...process.env, LIVE_BACKEND: '1', EXPO_PUBLIC_API_URL: `${baseUrl}/api/v1`, LIVE_JWT_ACCESS_EXPIRES_IN: accessTtl },
  });
  exitCode = jest.status ?? 1;
  if (exitCode !== 0) {
    keepWorkDir = true;
    console.error(`\nLog del backend: ${logPath}`);
  }
} catch (error) {
  console.error(`\n✖ ${error.message}`);
} finally {
  await cleanup();
}
process.exit(exitCode);
