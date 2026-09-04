# env-schema-guard

<p align="center">
  <strong>Zero-dependency, type-safe environment variable validation for Node.js and TypeScript.</strong><br />
  Catch missing, malformed, or misconfigured <code>.env</code> variables <em>at startup</em> before your app crashes in production.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/env-schema-guard"><img src="https://img.shields.io/npm/v/env-schema-guard.svg?style=flat-square&color=blue" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/env-schema-guard"><img src="https://img.shields.io/npm/dm/env-schema-guard.svg?style=flat-square&color=emerald" alt="npm downloads" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/env-schema-guard.svg?style=flat-square&color=purple" alt="license" /></a>
  <img src="https://img.shields.io/badge/types-TypeScript-blue.svg?style=flat-square" alt="TypeScript ready" />
  <img src="https://img.shields.io/badge/dependencies-0-success.svg?style=flat-square" alt="Zero dependencies" />
</p>

---

## ⚡ Why env-schema-guard?

Have you ever had a server start up cleanly, only to crash 30 minutes later during a user request because `DATABASE_URL` was misspelled or `PORT` was passed as an invalid string?

Traditional schema libraries (like Zod or Joi) are great, but they add extra bundle overhead and require complex boilerplate just for environment variables. **`env-schema-guard`** is:

- 🪶 **Zero dependencies**: Extremely lightweight with minimal footprint.
- 🔒 **Full TypeScript inference**: Returned object is strongly typed based on your schema automatically (no manual `as number` casts!).
- 🚨 **Fails fast & aggregated**: Reports **all** missing or invalid variables at once instead of failing on the first one.
- 🛠️ **Built-in type coercion**: Automatically parses `"true"` to `boolean`, `"8080"` to `number`, and validates ports, URLs, JSON, and emails.
- 📦 **Dual ESM & CJS support**: Native ESM and CommonJS exports for compatibility across Node.js, Bun, tsx, Next.js, and Express.

---

## 📦 Installation

```bash
# npm
npm install env-schema-guard

# pnpm
pnpm add env-schema-guard

# yarn
yarn add env-schema-guard

# bun
bun add env-schema-guard
```

---

## 🚀 Quick Start

Create a dedicated `env.ts` (or `env.js`) file in your project:

```ts
import { validateEnv } from "env-schema-guard";
import "dotenv/config"; // load your .env file if using dotenv

export const env = validateEnv({
  PORT: { 
    type: "port", 
    default: 3000, 
    description: "HTTP server port (0-65535)" 
  },
  NODE_ENV: { 
    type: "string", 
    enum: ["development", "staging", "production"] as const, 
    default: "development" 
  },
  DATABASE_URL: { 
    type: "url", 
    description: "Postgres database connection string" 
  },
  ENABLE_ANALYTICS: { 
    type: "boolean", 
    default: false 
  },
  ADMIN_EMAIL: { 
    type: "email", 
    required: false 
  },
  FEATURE_FLAGS: { 
    type: "json", 
    required: false 
  },
  API_KEY: { 
    type: "string", 
    pattern: /^sk_live_[a-zA-Z0-9]{16,}$/, 
    description: "Live secret API key" 
  },
});

// Fully typed!
console.log(env.PORT);             // number (e.g. 3000)
console.log(env.NODE_ENV);         // "development" | "staging" | "production"
console.log(env.DATABASE_URL);     // string (validated URL)
console.log(env.ENABLE_ANALYTICS); // boolean (parsed from true/false/1/0/yes/no)
```

---

## 💥 Clear, Aggregated Error Messages

If any variables are missing or invalid, `validateEnv` throws `EnvValidationError` detailing every issue at once:

```text
EnvValidationError: env-guard: 3 environment variable issue(s) found:
  - DATABASE_URL is missing (Postgres database connection string)
  - PORT: expected a valid port (0-65535), got "999999"
  - API_KEY: does not match required pattern /^sk_live_[a-zA-Z0-9]{16,}$/
```

Your app crashes immediately on `npm start`, giving your team an instant checklist to fix before running.

---

## 📑 Supported Data Types

`env-schema-guard` includes built-in coercers and validators for common environment configuration formats:

| Type | Coerced Output | Example Valid Inputs | Example Invalid Inputs |
|---|---|---|---|
| `"string"` | `string` | `"hello"`, `"secret_key"` | Missing or empty string (if required) |
| `"number"` | `number` | `"42"`, `"3.14"`, `"-10"` | `"abc"`, `"NaN"` |
| `"port"` | `number` | `"80"`, `"3000"`, `"8080"` | `"-1"`, `"65536"`, `"abc"` |
| `"boolean"` | `boolean` | `"true"`, `"1"`, `"yes"`, `"on"` / `"false"`, `"0"`, `"no"`, `"off"` | `"maybe"`, `"enabled"` |
| `"url"` | `string` | `"https://api.domain.com"`, `"postgres://user:p@host/db"` | `"not-a-url"`, `"ftp//bad"` |
| `"email"` | `string` | `"admin@domain.com"`, `"dev.ops@sub.domain.co"` | `"admin@"`, `"plainaddress"` |
| `"json"` | `unknown` | `'{"rateLimit": 100, "debug": true}'` | `"{broken: json"` |

---

## 🛠️ Schema Field Configuration

Each key in your schema is configured with a `FieldSchema` object:

```ts
interface FieldSchema<T = unknown> {
  /** Target type to validate and coerce into */
  type: "string" | "number" | "boolean" | "url" | "email" | "json" | "port";

  /** Whether the variable is required. Defaults to true. */
  required?: boolean;

  /** Default fallback value if the environment variable is not set. */
  default?: T;

  /** Restrict to a specific set of allowed values. */
  enum?: readonly T[];

  /** Custom validator function; return true if valid or an error message string. */
  validate?: (value: T) => true | string;

  /** Regular expression the raw string must match before coercion. */
  pattern?: RegExp;

  /** Helpful human-readable description displayed in error reports. */
  description?: string;
}
```

---

## 🛡️ Non-Throwing Validation: `safeValidateEnv`

If you're building CLI tools, setup scripts, or custom bootstrap sequences where you don't want an uncaught exception, use `safeValidateEnv`:

```ts
import { safeValidateEnv } from "env-schema-guard";

const result = safeValidateEnv({
  PORT: { type: "port", default: 8080 },
  DATABASE_URL: { type: "url" },
});

if (!result.success) {
  console.error("❌ Configuration error:");
  result.issues.forEach((err) => console.error(`   ${err}`));
  process.exit(1);
}

// Access validated and typed data
const { PORT, DATABASE_URL } = result.data;
```

---

## 🧪 Custom Source (Testing & In-Memory Envs)

By default, `validateEnv` inspects `process.env`. You can supply a custom object via `source` for unit tests, staging mocks, or serverless request headers:

```ts
import { validateEnv } from "env-schema-guard";

const testEnv = validateEnv(
  {
    PORT: { type: "port" },
    NODE_ENV: { type: "string" },
  },
  {
    source: {
      PORT: "4000",
      NODE_ENV: "test",
    },
  }
);

console.log(testEnv.PORT); // 4000
```

---

## 💡 Advanced Examples

### Custom Validation Logic

You can enforce business rules (like min/max bounds, CIDR subnets, or divisible intervals) using `validate`:

```ts
const env = validateEnv({
  MAX_CONNECTIONS: {
    type: "number",
    default: 10,
    validate: (val) => (val > 0 && val <= 100 ? true : "Must be between 1 and 100"),
  },
  CRON_EXPRESSION: {
    type: "string",
    validate: (val) => (val.split(" ").length === 5 ? true : "Must be a 5-part cron syntax"),
  },
});
```

### Express.js Integration

```ts
// src/config.ts
import "dotenv/config";
import { validateEnv } from "env-schema-guard";

export const config = validateEnv({
  PORT: { type: "port", default: 3000 },
  JWT_SECRET: { type: "string", description: "Secret for signing JWT tokens" },
  CORS_ORIGIN: { type: "url", default: "http://localhost:3000" },
});

// src/server.ts
import express from "express";
import { config } from "./config";

const app = express();

app.listen(config.PORT, () => {
  console.log(`Server listening on port ${config.PORT}`);
});
```

---

## 📊 Comparison

| Feature | `env-schema-guard` | Zod | envalid |
|---|:---:|:---:|:---:|
| **Zero Dependencies** | ✅ **Yes** | ❌ No | ❌ No |
| **Bundle Size** | 🪶 **< 2.5 KB** | ~50+ KB | ~15 KB |
| **Startup Speed** | ⚡ **Instant** | Fast | Moderate |
| **Full TypeScript Inference** | ✅ **Yes** | ✅ Yes | ✅ Yes |
| **Aggregated Error Reporting** | ✅ **Yes** | ✅ Yes | ✅ Yes |
| **Port & URL Built-in Check** | ✅ **Yes** | ⚠️ Partial | ✅ Yes |

---

## 🧪 Testing

Run the included test suite with Node's native test runner:

```bash
npm test
```

Build the distribution bundles (ESM, CommonJS, and TypeScript `.d.ts` declaration maps):

```bash
npm run build
```

---

## 📄 License

[MIT](./LICENSE) © [Tushar](https://github.com/)
