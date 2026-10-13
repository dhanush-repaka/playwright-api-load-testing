/**
 * Self-contained mock REST API used as the default system-under-test.
 * Lets the framework be demonstrated end-to-end without load testing a
 * real or third-party service.
 *
 * Tunables (env): MOCK_PORT, MOCK_BASE_LATENCY_MS, MOCK_LATENCY_JITTER_MS, MOCK_ERROR_RATE (0-1)
 * Auth (env):     MOCK_REQUIRE_AUTH (true = every /api route needs a bearer token, like a corporate gateway)
 *                 MOCK_STATIC_TOKENS (comma-separated pre-issued tokens the API accepts)
 *                 MOCK_OAUTH_CLIENT_ID / MOCK_OAUTH_CLIENT_SECRET / MOCK_OAUTH_TOKEN_TTL_SECONDS
 */
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const PORT = Number(process.env.MOCK_PORT ?? 3100);
const BASE_LATENCY = Number(process.env.MOCK_BASE_LATENCY_MS ?? 20);
const JITTER = Number(process.env.MOCK_LATENCY_JITTER_MS ?? 30);
const ERROR_RATE = Number(process.env.MOCK_ERROR_RATE ?? 0);
const REQUIRE_AUTH = process.env.MOCK_REQUIRE_AUTH === 'true';
const OAUTH_CLIENT_ID = process.env.MOCK_OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.MOCK_OAUTH_CLIENT_SECRET;
const OAUTH_TTL_SECONDS = Number(process.env.MOCK_OAUTH_TOKEN_TTL_SECONDS ?? 3600);
/** Routes reachable without a token even when MOCK_REQUIRE_AUTH=true. */
const PUBLIC_ROUTES = new Set(['/health', '/api/auth/login', '/oauth/token']);

type Json = Record<string, unknown>;
type Handler = (ctx: {
  req: IncomingMessage;
  params: Record<string, string>;
  query: URLSearchParams;
  body: Json;
}) => { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>;

/* ----------------------------- seed data ----------------------------- */

const CATEGORIES = ['electronics', 'furniture', 'books', 'clothing'];
const users = new Map<number, Json>(
  Array.from({ length: 100 }, (_, i) => [
    i + 1,
    { id: i + 1, firstName: `User${i + 1}`, lastName: 'Seed', email: `user${i + 1}@example.test`, role: 'customer' },
  ]),
);
const products = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1,
  sku: `SKU-${1000 + i}`,
  name: `Product ${i + 1}`,
  category: CATEGORIES[i % CATEGORIES.length],
  price: 10 + ((i * 7) % 300),
}));
const orders = new Map<string, Json>();
const tokens = new Set<string>(
  (process.env.MOCK_STATIC_TOKENS ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean),
);
const accounts = new Map<string, string>(
  (
    JSON.parse(fs.readFileSync(path.resolve(__dirname, '../test-data/datasets/users.json'), 'utf-8')) as {
      username: string;
      password: string;
    }[]
  ).map((u) => [u.username, u.password]),
);
let nextUserId = users.size + 1;
let requestCount = 0;

/* ------------------------------ helpers ------------------------------ */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const latency = () => BASE_LATENCY + Math.random() * JITTER;
const authorised = (req: IncomingMessage) => tokens.has((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
const unauthorised = { status: 401, body: { error: 'Unauthorized' } };

/* ------------------------------- routes ------------------------------ */

const routes: [string, string, Handler][] = [
  /** OAuth2 client-credentials token endpoint (form-encoded, like real identity providers). */
  [
    'POST',
    '/oauth/token',
    ({ body }) => {
      if (body.grant_type !== 'client_credentials') return { status: 400, body: { error: 'unsupported_grant_type' } };
      if (!OAUTH_CLIENT_ID || body.client_id !== OAUTH_CLIENT_ID || body.client_secret !== OAUTH_CLIENT_SECRET) {
        return { status: 401, body: { error: 'invalid_client' } };
      }
      const token = `oauth-${randomUUID()}`;
      tokens.add(token);
      return {
        status: 200,
        body: { access_token: token, token_type: 'Bearer', expires_in: OAUTH_TTL_SECONDS, scope: body.scope },
      };
    },
  ],

  [
    'GET',
    '/health',
    () => ({ status: 200, body: { status: 'UP', uptimeSeconds: Math.round(process.uptime()), requestCount } }),
  ],

  [
    'POST',
    '/api/auth/login',
    ({ body }) => {
      const expected = accounts.get(String(body.username));
      if (!expected || expected !== body.password) return { status: 401, body: { error: 'Invalid credentials' } };
      const token = randomUUID();
      tokens.add(token);
      return { status: 200, body: { token, expiresIn: 3600 } };
    },
  ],

  [
    'GET',
    '/api/users',
    ({ query }) => {
      const page = Math.max(1, Number(query.get('page') ?? 1));
      const limit = Math.min(100, Number(query.get('limit') ?? 20));
      const all = [...users.values()];
      return {
        status: 200,
        body: { page, limit, total: all.length, items: all.slice((page - 1) * limit, page * limit) },
      };
    },
  ],
  [
    'GET',
    '/api/users/:id',
    ({ params }) => {
      const user = users.get(Number(params.id));
      return user ? { status: 200, body: user } : { status: 404, body: { error: 'User not found' } };
    },
  ],
  [
    'POST',
    '/api/users',
    ({ body }) => {
      if (!body.email || !body.firstName) return { status: 400, body: { error: 'firstName and email are required' } };
      const user = { ...body, id: nextUserId++, createdAt: new Date().toISOString() };
      users.set(user.id, user);
      return { status: 201, body: user };
    },
  ],
  [
    'PUT',
    '/api/users/:id',
    ({ params, body }) => {
      const user = users.get(Number(params.id));
      if (!user) return { status: 404, body: { error: 'User not found' } };
      Object.assign(user, body);
      return { status: 200, body: user };
    },
  ],

  [
    'GET',
    '/api/products/search',
    ({ query }) => {
      const q = (query.get('q') ?? '').toLowerCase();
      const items = products.filter((p) => p.name.toLowerCase().includes(q) || p.category.includes(q)).slice(0, 20);
      return { status: 200, body: { query: q, total: items.length, items } };
    },
  ],
  [
    'GET',
    '/api/products',
    ({ query }) => {
      const category = query.get('category');
      const items = category ? products.filter((p) => p.category === category) : products;
      return { status: 200, body: { total: items.length, items: items.slice(0, 20) } };
    },
  ],
  [
    'GET',
    '/api/products/:id',
    ({ params }) => {
      const product = products.find((p) => p.id === Number(params.id));
      return product ? { status: 200, body: product } : { status: 404, body: { error: 'Product not found' } };
    },
  ],

  [
    'POST',
    '/api/orders',
    ({ req, body }) => {
      if (!authorised(req)) return unauthorised;
      const items = body.items as { productId: number; quantity: number }[] | undefined;
      if (!items?.length) return { status: 400, body: { error: 'Order must contain items' } };
      const total = items.reduce(
        (sum, i) => sum + (products.find((p) => p.id === i.productId)?.price ?? 0) * i.quantity,
        0,
      );
      const order = { id: randomUUID(), status: 'CONFIRMED', items, total, createdAt: new Date().toISOString() };
      orders.set(order.id, order);
      return { status: 201, body: order };
    },
  ],
  [
    'GET',
    '/api/orders/:id',
    ({ req, params }) => {
      if (!authorised(req)) return unauthorised;
      const order = orders.get(params.id);
      return order ? { status: 200, body: order } : { status: 404, body: { error: 'Order not found' } };
    },
  ],

  /** Deliberately slow endpoint to demonstrate SLA breaches. */
  [
    'GET',
    '/api/reports/heavy',
    async ({ query }) => {
      await delay(Number(query.get('ms') ?? 600) + Math.random() * 200);
      return { status: 200, body: { generated: true } };
    },
  ],
];

const compiled = routes.map(([method, pattern, handler]) => {
  const keys: string[] = [];
  const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k: string) => (keys.push(k), '([^/]+)'))}$`);
  return { method, regex, keys, handler };
});

/* ------------------------------- server ------------------------------ */

async function readBody(req: IncomingMessage): Promise<Json> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf-8');
  if ((req.headers['content-type'] ?? '').includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    return JSON.parse(raw) as Json;
  } catch {
    return {};
  }
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  requestCount++;
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const route = compiled.find((r) => r.method === req.method && r.regex.test(url.pathname));
  if (!route) return send(res, 404, { error: `No route for ${req.method} ${url.pathname}` });

  const match = url.pathname.match(route.regex)!;
  const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
  const body = await readBody(req);

  await delay(latency());
  if (REQUIRE_AUTH && !PUBLIC_ROUTES.has(url.pathname) && !authorised(req)) {
    return send(res, 401, { error: 'Missing or invalid bearer token' });
  }
  if (url.pathname !== '/health' && Math.random() < ERROR_RATE) {
    return send(res, 503, { error: 'Injected failure (MOCK_ERROR_RATE)' });
  }
  const result = await route.handler({ req, params, query: url.searchParams, body });
  send(res, result.status, result.body);
});

server.keepAliveTimeout = 65_000;
server.listen(PORT, () => {
  console.log(
    `[mock-server] listening on http://localhost:${PORT} (latency ${BASE_LATENCY}+${JITTER}ms, errorRate ${ERROR_RATE}, requireAuth ${REQUIRE_AUTH})`,
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
