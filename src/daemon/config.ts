import fs from "node:fs/promises";
import path from "node:path";
import type { EnvSnapshot } from "./env-snapshot.js";
import { DAEMON_CONFIG_DIR, DAEMON_CONFIG_FILENAME, DAEMON_PORT_DEFAULT } from "./constants.js";

export type DaemonConfigV1 = {
  version: 1;
  token: string;
  port: number;
  env: EnvSnapshot;
  installedAt: string;
};

export type DaemonConfig = DaemonConfigV1;

function resolveHomeDir(env: Record<string, string | undefined>): string {
  const home = env.HOME?.trim() || env.USERPROFILE?.trim();
  if (!home) throw new Error("Missing HOME (required for daemon config)");
  return home;
}

export function resolveDaemonConfigPath(env: Record<string, string | undefined>): string {
  const home = resolveHomeDir(env);
  return path.join(home, DAEMON_CONFIG_DIR, DAEMON_CONFIG_FILENAME);
}

export function normalizeDaemonToken(raw: string): string {
  const token = raw.trim();
  if (!token) throw new Error("Missing token");
  if (token.length < 16) throw new Error("Token too short (expected >= 16 chars)");
  return token;
}

export function normalizeDaemonPort(raw: unknown): number {
  const port = typeof raw === "number" ? raw : DAEMON_PORT_DEFAULT;
  if (!Number.isFinite(port) || port <= 0 || port >= 65535) {
    throw new Error(`Invalid port: ${String(raw)}`);
  }
  return Math.floor(port);
}

export async function readDaemonConfig({
  env,
}: {
  env: Record<string, string | undefined>;
}): Promise<DaemonConfig | null> {
  const configPath = resolveDaemonConfigPath(env);
  let text: string;
  try {
    text = await fs.readFile(configPath, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid daemon config JSON at ${configPath}: ${message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid daemon config at ${configPath}: expected object`);
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== 1) throw new Error(`Invalid daemon config at ${configPath}: version`);
  const tokenRaw = typeof obj.token === "string" ? obj.token : "";
  const token = normalizeDaemonToken(tokenRaw);
  const port = normalizeDaemonPort(typeof obj.port === "number" ? obj.port : DAEMON_PORT_DEFAULT);
  const envRaw = obj.env && typeof obj.env === "object" ? (obj.env as Record<string, unknown>) : {};
  const envSnapshot: EnvSnapshot = {};
  for (const [k, v] of Object.entries(envRaw)) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    envSnapshot[k as keyof EnvSnapshot] = trimmed;
  }
  const installedAt =
    typeof obj.installedAt === "string" ? obj.installedAt : new Date().toISOString();
  return { version: 1, token, port, env: envSnapshot, installedAt };
}

export async function writeDaemonConfig({
  env,
  config,
}: {
  env: Record<string, string | undefined>;
  config: Omit<DaemonConfig, "version" | "installedAt"> &
    Partial<Pick<DaemonConfig, "installedAt">>;
}): Promise<string> {
  const configPath = resolveDaemonConfigPath(env);
  const dir = path.dirname(configPath);
  await fs.mkdir(dir, { recursive: true });
  const payload: DaemonConfig = {
    version: 1,
    token: normalizeDaemonToken(config.token),
    port: normalizeDaemonPort(config.port),
    env: config.env ?? {},
    installedAt: config.installedAt ?? new Date().toISOString(),
  };
  await fs.writeFile(configPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return configPath;
}
