import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';

const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validators = new Map();

export class DiagnosticError extends Error {
  constructor(diagnostics) {
    super(diagnostics.map(d => `${d.path || '/'}: ${d.message}`).join('; '));
    this.name = 'DiagnosticError';
    this.diagnostics = diagnostics;
  }
}

export function diagnostic(code, message, file = '<input>', path = '') {
  return { code, file, path, message };
}

export function schemaDiagnostics(name, value, file = '<input>') {
  if (!validators.has(name)) {
    const schema = JSON.parse(readFileSync(new URL(`../schemas/0.1.0/${name}.schema.json`, import.meta.url), 'utf8'));
    validators.set(name, ajv.compile(schema));
  }
  const validate = validators.get(name);
  if (validate(value)) return [];
  return validate.errors.map(error => {
    const escape = x => x.replace(/~/g, '~0').replace(/\//g, '~1');
    const property = error.params.missingProperty ?? error.params.additionalProperty;
    const path = error.instancePath + (property === undefined ? '' : `/${escape(property)}`);
    const messages = {
      required: `${property} is required`,
      additionalProperties: `${property} is unknown`,
      const: `must be ${error.params.allowedValue}`,
      pattern: 'has an invalid format (expected a nonempty string matching the contract)',
      uniqueItems: 'contains duplicates',
      minimum: 'must be a positive safe integer',
      maximum: 'must be a positive safe integer'
    };
    const message = error.keyword === 'type' && path.startsWith('/project/limits/') ? 'must be a positive safe integer' : messages[error.keyword] ?? error.message;
    return diagnostic(`SCHEMA_${error.keyword.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}`, message, file, path);
  });
}

export function assertSchema(name, value, file) {
  const errors = schemaDiagnostics(name, value, file);
  if (errors.length) throw new DiagnosticError(errors);
  return value;
}

export function diagnosticsOf(error, file = '<input>', path = '') {
  return error.diagnostics ?? [diagnostic('SEMANTIC_CONSTRAINT', error.message, file, path)];
}
