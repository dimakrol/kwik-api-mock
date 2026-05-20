#!/usr/bin/env node

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { parseArgs, buildRequestBody, stripTrailingSlash } = require('./fire-webhook-lib.cjs');

function printHelp() {
  console.log(`Usage:
  pnpm webhook:send -- --target-url <url> --event-type <type> [options]
  pnpm webhook:send -- --target-preset <local|stage> --company-uuid <uuid> --event-type <type> [options]

Options:
  --mock-base-url <url>     Kwik mock admin base URL. Default: http://localhost:3099
  --target-url <url>        Final webhook URL passed to /admin/webhook/fire
  --target-preset <name>    Build target from preset base: local | stage
  --company-uuid <uuid>     Used with --target-preset
  --event-type <type>       Same event types as the web sender
  --template                Start payload from the sender template for the event type
  --payload-json <json>     Use JSON payload directly
  --payload-file <path>     Read payload JSON from file
  --set <key=value>         Override/add top-level payload fields. Repeatable
  --auth-mode <mode>        default | basic | api-key | hmac | none
  --access-key <value>      Auth override access key
  --access-secret <value>   Auth override access secret
  --hmac-secret <value>     Auth override HMAC secret
  --help                    Show this help
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const mockBaseUrl = args['mock-base-url'] || 'http://localhost:3099';
  const body = await buildRequestBody(args, (path) => readFile(path, 'utf8'));

  const response = await fetchJson(`${stripTrailingSlash(mockBaseUrl)}/admin/webhook/fire`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  console.log(JSON.stringify(response.body, null, 2));
  if (!response.ok || !response.body?.ok) {
    process.exitCode = 1;
  }
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  return { ok: response.ok, status: response.status, body };
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
