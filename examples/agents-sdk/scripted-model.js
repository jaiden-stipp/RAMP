import { Usage } from '@openai/agents';

// Implements the actual SDK Model contract. No provider, HTTP client or key is used.
export class ScriptedModel {
  constructor(steps) { this.steps = structuredClone(steps); this.requests = []; }
  async getResponse(request) {
    request.signal?.throwIfAborted(); this.requests.push({ instructions: request.systemInstructions, input: structuredClone(request.input), tools: request.tools.map(t => t.name) });
    const step = this.steps.shift(); if (!step) throw new Error('Unexpected model turn: script exhausted');
    const output = step.tool ? [{ type: 'function_call', callId: `script-${this.requests.length}`, name: step.tool, arguments: JSON.stringify(step.args), status: 'completed' }]
      : [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: step.final }] }];
    return { output, usage: new Usage(), responseId: `offline-${this.requests.length}` };
  }
  async *getStreamedResponse() { throw new Error('This deterministic conformance model does not implement streaming'); }
}
