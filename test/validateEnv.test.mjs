import test from "node:test";
import assert from "node:assert/strict";
import { validateEnv, safeValidateEnv, EnvValidationError } from "../dist/index.js";

test("validateEnv - parses all supported types correctly", () => {
  const env = validateEnv(
    {
      APP_NAME: { type: "string" },
      PORT: { type: "port" },
      MAX_WORKERS: { type: "number" },
      ENABLE_LOGS: { type: "boolean" },
      DATABASE_URL: { type: "url" },
      ADMIN_EMAIL: { type: "email" },
      CONFIG_DATA: { type: "json" },
    },
    {
      source: {
        APP_NAME: "MyService",
        PORT: "8080",
        MAX_WORKERS: "4",
        ENABLE_LOGS: "true",
        DATABASE_URL: "postgres://user:pass@localhost:5432/mydb",
        ADMIN_EMAIL: "admin@example.com",
        CONFIG_DATA: '{"theme":"dark","features":["auth","billing"]}',
      },
    }
  );

  assert.equal(env.APP_NAME, "MyService");
  assert.equal(env.PORT, 8080);
  assert.equal(env.MAX_WORKERS, 4);
  assert.equal(env.ENABLE_LOGS, true);
  assert.equal(env.DATABASE_URL, "postgres://user:pass@localhost:5432/mydb");
  assert.equal(env.ADMIN_EMAIL, "admin@example.com");
  assert.deepEqual(env.CONFIG_DATA, { theme: "dark", features: ["auth", "billing"] });
});

test("validateEnv - handles default values when source is missing", () => {
  const env = validateEnv(
    {
      PORT: { type: "port", default: 3000 },
      DEBUG: { type: "boolean", default: false },
      TIMEOUT: { type: "number", default: 5000 },
    },
    { source: {} }
  );

  assert.equal(env.PORT, 3000);
  assert.equal(env.DEBUG, false);
  assert.equal(env.TIMEOUT, 5000);
});

test("validateEnv - handles optional fields (required: false)", () => {
  const env = validateEnv(
    {
      SENTRY_DSN: { type: "string", required: false },
    },
    { source: {} }
  );

  assert.equal(env.SENTRY_DSN, undefined);
});

test("validateEnv - validates enum values", () => {
  const env = validateEnv(
    {
      NODE_ENV: {
        type: "string",
        enum: ["development", "staging", "production"],
      },
    },
    { source: { NODE_ENV: "production" } }
  );

  assert.equal(env.NODE_ENV, "production");

  assert.throws(
    () => {
      validateEnv(
        {
          NODE_ENV: {
            type: "string",
            enum: ["development", "staging", "production"],
          },
        },
        { source: { NODE_ENV: "invalid_env" } }
      );
    },
    (err) => {
      assert.ok(err instanceof EnvValidationError);
      assert.match(err.message, /must be one of \[development, staging, production\]/);
      return true;
    }
  );
});

test("validateEnv - validates regex patterns", () => {
  const env = validateEnv(
    {
      API_KEY: { type: "string", pattern: /^sk_live_[a-z0-9]{8}$/ },
    },
    { source: { API_KEY: "sk_live_12345678" } }
  );

  assert.equal(env.API_KEY, "sk_live_12345678");

  assert.throws(
    () => {
      validateEnv(
        {
          API_KEY: { type: "string", pattern: /^sk_live_[a-z0-9]{8}$/ },
        },
        { source: { API_KEY: "invalid_key" } }
      );
    },
    (err) => {
      assert.ok(err instanceof EnvValidationError);
      assert.match(err.message, /does not match required pattern/);
      return true;
    }
  );
});

test("validateEnv - custom validator function", () => {
  const schema = {
    CLUSTER_SIZE: {
      type: "number",
      validate: (val) => (val % 2 === 0 ? true : "Must be an even number"),
    },
  };

  const valid = validateEnv(schema, { source: { CLUSTER_SIZE: "4" } });
  assert.equal(valid.CLUSTER_SIZE, 4);

  assert.throws(
    () => validateEnv(schema, { source: { CLUSTER_SIZE: "5" } }),
    (err) => {
      assert.ok(err instanceof EnvValidationError);
      assert.match(err.message, /Must be an even number/);
      return true;
    }
  );
});

test("validateEnv - throws aggregate error with all issues", () => {
  assert.throws(
    () => {
      validateEnv(
        {
          PORT: { type: "port" },
          DB_HOST: { type: "string", description: "Database host IP/Domain" },
          ADMIN_EMAIL: { type: "email" },
        },
        {
          source: {
            PORT: "not-a-port",
            ADMIN_EMAIL: "bad-email",
          },
        }
      );
    },
    (err) => {
      assert.ok(err instanceof EnvValidationError);
      assert.equal(err.issues.length, 3);
      assert.ok(err.issues.some((i) => i.includes("PORT: expected a valid port")));
      assert.ok(err.issues.some((i) => i.includes("DB_HOST is missing (Database host IP/Domain)")));
      assert.ok(err.issues.some((i) => i.includes("ADMIN_EMAIL: expected a valid email")));
      return true;
    }
  );
});

test("safeValidateEnv - does not throw, returns success boolean and issues", () => {
  const successResult = safeValidateEnv(
    { PORT: { type: "port", default: 3000 } },
    { source: {} }
  );
  assert.equal(successResult.success, true);
  if (successResult.success) {
    assert.equal(successResult.data.PORT, 3000);
  }

  const failedResult = safeValidateEnv(
    { PORT: { type: "port" } },
    { source: { PORT: "999999" } }
  );
  assert.equal(failedResult.success, false);
  if (!failedResult.success) {
    assert.equal(failedResult.issues.length, 1);
    assert.match(failedResult.issues[0], /expected a valid port/);
  }
});
