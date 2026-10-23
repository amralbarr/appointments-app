import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

export interface ChatTool {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, Record<string, unknown>>; required: string[] };
}

// resolved from process.cwd(), not __dirname - __dirname differs between
// a dev run (backend/src/chat, ts-node, no separate build output) and the
// real compiled production run (backend/dist/src/chat, one directory
// deeper), which previously made a fixed "../../../" guess correct in dev
// and every test (both run straight from src/) but silently wrong in the
// one environment that actually matters (PM2 running dist/src/main.js) -
// found by actually curling the live chat endpoint against the real
// compiled build, not assumed. process.cwd() is reliably "backend/" in
// both cases instead (npm run start:dev is invoked from inside backend/;
// ecosystem.config.js sets the same cwd for the compiled process), so
// one "../" reliably reaches the repo root regardless of src vs dist.
const YAML_PATH = path.resolve(process.cwd(), '../mcp-gateway/configs/appointments.yaml');

// never list_platforms/get_platform/list_bookings here - a customer-facing
// chat session must never see cross-tenant data, proven by
// mcp-tool-schema.spec.ts, not just this filter.
const CUSTOMER_FACING_TOOLS = ['list_services', 'list_slots', 'create_booking', 'cancel_booking'];

interface YamlSchemaField {
  type: string;
  optional?: boolean;
  description?: string;
  default?: unknown;
  values?: string[];
}

interface YamlToolDef {
  name: string;
  description: string;
  schema: Record<string, YamlSchemaField>;
}

// the yaml's own "enum" isn't a real json-schema type - it's { type:
// string, enum: [...] } instead.
function toJsonSchemaType(yamlType: string): string {
  return yamlType === 'enum' ? 'string' : yamlType;
}

export function buildCustomerFacingTools(): ChatTool[] {
  const raw = fs.readFileSync(YAML_PATH, 'utf-8');
  const config = YAML.parse(raw) as { tools: YamlToolDef[] };

  return config.tools
    .filter((tool) => CUSTOMER_FACING_TOOLS.includes(tool.name))
    .map((tool) => {
      const properties: Record<string, Record<string, unknown>> = {};
      const required: string[] = [];

      for (const [field, def] of Object.entries(tool.schema)) {
        properties[field] = {
          type: toJsonSchemaType(def.type),
          ...(def.description ? { description: def.description } : {}),
          ...(def.values ? { enum: def.values } : {}),
        };
        if (!def.optional) required.push(field);
      }

      return {
        name: tool.name,
        description: tool.description,
        input_schema: { type: 'object' as const, properties, required },
      };
    });
}
