// AI gateway env vars — unit tests mock global.fetch so these never reach
// a real endpoint, but callGateway() validates that they're present before
// calling fetch; without them every chat service test fails on the env
// check before the mock even has a chance to run.
process.env.AI_GATEWAY_URL ??= 'https://ai.test.invalid/generate';
process.env.AI_GATEWAY_PROVIDER ??= 'agentox';
process.env.AI_CHAT_MODEL ??= 'company-coder';
process.env.AI_GATEWAY_API_KEY ??= 'test-key';
