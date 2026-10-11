import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type QueryResult, type QueryResultRow } from "pg";

const environmentFile = resolve(dirname(fileURLToPath(import.meta.url)), "../.env");
const databaseUrlFromProcess = process.env.DATABASE_URL;
const environmentResult = dotenv.config({ path: environmentFile, quiet: true });

const connectionString = process.env.DATABASE_URL?.trim();
const connectionTimeoutMillis = 5_000;
let configurationError = false;
let pool: Pool | null = null;
let connectionTarget: { hostname: string; port: string } | null = null;

if (connectionString) {
  try {
    const connectionUrl = new URL(connectionString);
    if (
      !["postgres:", "postgresql:"].includes(connectionUrl.protocol) ||
      !connectionUrl.hostname ||
      connectionUrl.pathname.length < 2
    ) {
      throw new Error("Invalid PostgreSQL connection URL.");
    }

    connectionTarget = {
      hostname: connectionUrl.hostname,
      port: connectionUrl.port || "5432"
    };
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: true },
      connectionTimeoutMillis,
      idleTimeoutMillis: 30_000,
      max: 10,
      keepAlive: true
    });
    pool.on("error", (error: NodeJS.ErrnoException) => {
      logDatabaseFailure("connection", error, "Unexpected idle PostgreSQL client error");
    });
  } catch {
    configurationError = true;
    console.error("DATABASE_URL is invalid; PostgreSQL connectivity is disabled.");
  }
}

const databaseUrlSource = databaseUrlFromProcess !== undefined
  ? "process environment"
  : environmentResult.parsed?.DATABASE_URL !== undefined
    ? "backend/.env"
    : "not configured";
console.info("PostgreSQL connection configuration", {
  configured: Boolean(connectionString),
  source: databaseUrlSource,
  hostname: connectionTarget?.hostname ?? "unavailable",
  port: connectionTarget?.port ?? "unavailable",
  connectionTimeoutMillis,
  tls: { enabled: true, rejectUnauthorized: true }
});

export type DatabaseHealth =
  | { configured: false; reachable: false; status: "not_configured" }
  | { configured: true; reachable: false; status: "misconfigured" | "unavailable" }
  | { configured: true; reachable: true; status: "connected" };

export type DatabaseUnavailableReason = "not_configured" | "misconfigured" | "unavailable";

export interface DatabaseClient {
  query: DatabaseQuery;
}

export type DatabaseQuery = <Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: readonly unknown[]
) => Promise<Pick<QueryResult<Row>, "rows">>;

export type DatabaseTransaction = <T>(operation: (client: DatabaseClient) => Promise<T>) => Promise<T>;

export class DatabaseUnavailableError extends Error {
  constructor(readonly reason: DatabaseUnavailableReason) {
    super("The database is unavailable.");
    this.name = "DatabaseUnavailableError";
  }
}

function errorDetails(error: unknown): { name: string; message: string; code?: string } {
  if (!error || typeof error !== "object") {
    return { name: "UnknownError", message: "A non-error value was thrown." };
  }

  const name = "name" in error && typeof error.name === "string" ? error.name : "Error";
  const rawMessage = "message" in error && typeof error.message === "string"
    ? error.message
    : "No error message was provided.";
  const message = rawMessage
    .replace(connectionString ?? "\u0000", "[redacted database URL]")
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[redacted database URL]")
    .replace(/\b(password|passwd|secret|token|api[_-]?key)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 400);
  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  return { name, message, ...(code ? { code } : {}) };
}

function classifyFailureStage(details: ReturnType<typeof errorDetails>): string {
  const code = details.code ?? "";
  const message = details.message;

  if (["ENOTFOUND", "EAI_AGAIN", "EAI_FAIL"].includes(code) || /getaddrinfo|name resolution/i.test(message)) {
    return "dns_resolution";
  }
  if (code.startsWith("ERR_SSL") || /certificate|tls|ssl handshake/i.test(message)) {
    return "tls_negotiation";
  }
  if (code === "28P01" || code === "28000" || /password authentication failed|authentication failed/i.test(message)) {
    return "authentication";
  }
  if (["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH"].includes(code)) {
    return "tcp_connection";
  }
  if (code === "ETIMEDOUT") {
    return "tcp_or_connection_establishment";
  }
  if (code.startsWith("08")) {
    return "connection";
  }
  if (/connection timeout|timeout exceeded when trying to connect/i.test(message)) {
    return "connection_establishment_stage_unknown";
  }
  if (/^[0-9A-Z]{5}$/.test(code)) {
    return "query_execution";
  }
  return "connection_or_query_stage_unknown";
}

function logDatabaseFailure(stage: string, error: unknown, message: string): void {
  const details = errorDetails(error);
  console.error(message, {
    phase: stage,
    failureStage: classifyFailureStage(details),
    hostname: connectionTarget?.hostname ?? "unavailable",
    port: connectionTarget?.port ?? "unavailable",
    connectionTimeoutMillis,
    tls: { enabled: true, rejectUnauthorized: true },
    ...details,
    sqlstate: details.code && /^[0-9A-Z]{5}$/.test(details.code) ? details.code : undefined
  });
}

function hasConnectionErrorCode(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : undefined;
  if (typeof code === "string" && (
    code.startsWith("08") ||
    code.startsWith("28") ||
    code.startsWith("3D") ||
    code.startsWith("ERR_SSL") ||
    ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH", "57P01", "57P02", "57P03"].includes(code)
  )) return true;

  const message = "message" in error && typeof error.message === "string"
    ? error.message
    : "";
  return /timeout exceeded when trying to connect|connection (?:terminated|closed|refused)|connect e(?:conn|timedout)|getaddrinfo/i.test(message);
}

export async function checkDatabase(): Promise<DatabaseHealth> {
  if (!connectionString) {
    return { configured: false, reachable: false, status: "not_configured" };
  }
  if (configurationError || !pool) {
    return { configured: true, reachable: false, status: "misconfigured" };
  }

  try {
    await pool.query("SELECT 1");
    return { configured: true, reachable: true, status: "connected" };
  } catch (error) {
    logDatabaseFailure("health_check_query", error, "PostgreSQL health check failed");
    return { configured: true, reachable: false, status: "unavailable" };
  }
}

export async function queryDatabase<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = []
): Promise<QueryResult<Row>> {
  if (!connectionString) throw new DatabaseUnavailableError("not_configured");
  if (configurationError || !pool) throw new DatabaseUnavailableError("misconfigured");

  try {
    return await pool.query<Row>(text, [...values]);
  } catch (error) {
    logDatabaseFailure("database_query", error, "PostgreSQL query failed");
    if (hasConnectionErrorCode(error)) {
      throw new DatabaseUnavailableError("unavailable");
    }
    throw error;
  }
}

export const withDatabaseTransaction: DatabaseTransaction = async <T>(operation: (client: DatabaseClient) => Promise<T>): Promise<T> => {
  if (!connectionString) throw new DatabaseUnavailableError("not_configured");
  if (configurationError || !pool) throw new DatabaseUnavailableError("misconfigured");

  let client: import("pg").PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    logDatabaseFailure("transaction_connection", error, "PostgreSQL transaction connection failed");
    if (hasConnectionErrorCode(error)) throw new DatabaseUnavailableError("unavailable");
    throw error;
  }

  try {
    await client.query("BEGIN");
    const transactionClient: DatabaseClient = {
      query: async <Row extends QueryResultRow = QueryResultRow>(text: string, values: readonly unknown[] = []) =>
        client.query<Row>(text, [...values])
    };
    const result = await operation(transactionClient);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      logDatabaseFailure("transaction_rollback", rollbackError, "PostgreSQL transaction rollback failed");
    };
    if (hasConnectionErrorCode(error)) {
      logDatabaseFailure("transaction_query", error, "PostgreSQL transaction failed");
      throw new DatabaseUnavailableError("unavailable");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDatabase(): Promise<void> {
  await pool?.end();
}
