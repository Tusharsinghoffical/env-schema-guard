/**
 * env-guard
 * Zero-dependency schema validator for process.env / any env-like object.
 * Fails fast and loud at startup instead of crashing deep inside your app.
 */

export type EnvType = "string" | "number" | "boolean" | "url" | "email" | "json" | "port";

export interface FieldSchema<T = unknown> {
  type: EnvType;
  /** Required by default. Set false to make optional. */
  required?: boolean;
  /** Value used when the var is missing and not required. */
  default?: T;
  /** Restrict to a fixed set of allowed values (checked after type coercion). */
  enum?: readonly T[];
  /** Custom validator; return true if valid, or a string with the error message. */
  validate?: (value: T) => true | string;
  /** Regex the raw string must match (applied before type coercion). */
  pattern?: RegExp;
  /** Human description shown in error messages / generated docs. */
  description?: string;
}

export type Schema = Record<string, FieldSchema>;

type InferFieldType<F extends FieldSchema> = F["type"] extends "number" | "port"
  ? number
  : F["type"] extends "boolean"
  ? boolean
  : F["type"] extends "json"
  ? unknown
  : string;

export type InferSchema<S extends Schema> = {
  [K in keyof S]: InferFieldType<S[K]>;
};

export class EnvValidationError extends Error {
  public readonly issues: string[];

  constructor(issues: string[]) {
    super(
      `env-guard: ${issues.length} environment variable issue(s) found:\n` +
        issues.map((i) => `  - ${i}`).join("\n")
    );
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

const URL_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\/[^\s]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function coerce(raw: string, type: EnvType, key: string, issues: string[]): unknown {
  switch (type) {
    case "string":
      return raw;
    case "number": {
      const n = Number(raw);
      if (Number.isNaN(n)) {
        issues.push(`${key}: expected a number, got "${raw}"`);
        return undefined;
      }
      return n;
    }
    case "port": {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 65535) {
        issues.push(`${key}: expected a valid port (0-65535), got "${raw}"`);
        return undefined;
      }
      return n;
    }
    case "boolean": {
      const v = raw.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(v)) return true;
      if (["false", "0", "no", "off"].includes(v)) return false;
      issues.push(`${key}: expected a boolean (true/false/1/0), got "${raw}"`);
      return undefined;
    }
    case "url": {
      if (!URL_RE.test(raw)) {
        issues.push(`${key}: expected a valid URL, got "${raw}"`);
        return undefined;
      }
      return raw;
    }
    case "email": {
      if (!EMAIL_RE.test(raw)) {
        issues.push(`${key}: expected a valid email, got "${raw}"`);
        return undefined;
      }
      return raw;
    }
    case "json": {
      try {
        return JSON.parse(raw);
      } catch {
        issues.push(`${key}: expected valid JSON`);
        return undefined;
      }
    }
    default:
      return raw;
  }
}

export interface ValidateOptions {
  /** Source object to read from. Default: process.env */
  source?: Record<string, string | undefined>;
  /** Throw on failure (default) or just return issues without throwing. */
  throwOnError?: boolean;
}

/**
 * Validate an env source against a schema. Throws EnvValidationError by default.
 *
 * @example
 * const env = validateEnv({
 *   PORT: { type: "port", default: 3000 },
 *   DATABASE_URL: { type: "url" },
 *   DEBUG: { type: "boolean", default: false },
 *   NODE_ENV: { type: "string", enum: ["development", "production", "test"] },
 * });
 * // env.PORT is typed as number, env.DATABASE_URL as string, etc.
 */
export function validateEnv<S extends Schema>(
  schema: S,
  options: ValidateOptions = {}
): InferSchema<S> {
  const { source = (typeof process !== "undefined" ? process.env : {}), throwOnError = true } =
    options;

  const issues: string[] = [];
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(schema)) {
    const field = schema[key];
    const raw = source[key];

    if (raw === undefined || raw === "") {
      if (field.default !== undefined) {
        result[key] = field.default;
        continue;
      }
      if (field.required === false) {
        result[key] = undefined;
        continue;
      }
      issues.push(`${key} is missing${field.description ? ` (${field.description})` : ""}`);
      continue;
    }

    if (field.pattern && !field.pattern.test(raw)) {
      issues.push(`${key}: does not match required pattern ${field.pattern}`);
      continue;
    }

    const value = coerce(raw, field.type, key, issues);
    if (value === undefined && issues.length > 0) continue;

    if (field.enum && !field.enum.includes(value as never)) {
      issues.push(`${key}: must be one of [${field.enum.join(", ")}], got "${value}"`);
      continue;
    }

    if (field.validate) {
      const res = field.validate(value as never);
      if (res !== true) {
        issues.push(`${key}: ${typeof res === "string" ? res : "failed custom validation"}`);
        continue;
      }
    }

    result[key] = value;
  }

  if (issues.length > 0 && throwOnError) {
    throw new EnvValidationError(issues);
  }

  return result as InferSchema<S>;
}

/**
 * Same as validateEnv but never throws — returns { success, data, issues } instead.
 * Useful for scripts/CLIs that want to print a friendly summary and exit(1) themselves.
 */
export function safeValidateEnv<S extends Schema>(
  schema: S,
  options: Omit<ValidateOptions, "throwOnError"> = {}
): { success: true; data: InferSchema<S> } | { success: false; issues: string[] } {
  try {
    const data = validateEnv(schema, { ...options, throwOnError: true });
    return { success: true, data };
  } catch (err) {
    if (err instanceof EnvValidationError) {
      return { success: false, issues: err.issues };
    }
    throw err;
  }
}

export default validateEnv;
