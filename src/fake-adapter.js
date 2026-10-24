export function fakeSourceTool(sources, calls = []) {
  return { capability: 'source.read', resources: Object.keys(sources), phases: ['gather', 'analyze', 'review'],
    validateInput: input => input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).length === 0,
    execute: async ({ resource, signal }) => { signal.throwIfAborted(); calls.push(resource); return { source: resource, text: sources[resource], synthetic: true }; } };
}

export async function runFakeAgent(host, requests) {
  const outcomes = [];
  for (const request of requests) {
    try { outcomes.push({ ok: true, ...await host.requestTool(request) }); }
    catch (error) { outcomes.push({ ok: false, code: error.code ?? 'ERROR', message: error.message }); }
  }
  return outcomes;
}
