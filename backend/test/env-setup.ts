// jest sets this itself if nothing else does, but setting it explicitly
// means the throttler's skipIf (app.module.ts) doesn't depend on quietly
// trusting that default - the 20-way concurrency burst needs this to
// actually be 'test', not an assumption.
process.env.NODE_ENV = 'test';

// point every e2e run at the test database (docker-compose.test.yml),
// never the dev one - set before anything imports PrismaClient.
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://slotbook:slotbook@localhost:5433/slotbook_test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
process.env.MCP_INTERNAL_SECRET ??= 'test-internal-secret';
