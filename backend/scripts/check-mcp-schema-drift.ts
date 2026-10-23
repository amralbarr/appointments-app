/**
 * Static check for two bug classes that have already bitten this project
 * once for real (see the git history around "cancel_booking needed query
 * params, not a body"):
 *
 *   1. a GET/DELETE tool with a schema field missing from queryParams -
 *      the gateway engine only ever attaches a body to POST/PATCH, so
 *      that field is silently dropped on every real call through it.
 *   2. a tool's schema drifting out of sync with the DTO it actually
 *      calls into - a field renamed/added/removed on one side and not
 *      the other, or optionality disagreeing between the two.
 *
 * Deliberately a dumb, source-text regex scan rather than reflecting on
 * class-validator metadata - this is dev-time tooling that runs against
 * a handful of small, consistently-styled DTO files, not something that
 * needs to be a real TS compiler plugin.
 *
 * usage: npm run mcp:check-drift
 */
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

// one level further up than before the cd6a8ad monorepo restructure -
// mcp-gateway moved from a repo-root-sibling of this backend to its own
// top-level directory, renamed from `mcp` to `mcp-gateway`.
const YAML_PATH = path.join(__dirname, '../../mcp-gateway/configs/appointments.yaml');

interface ToolSchemaField {
  optional?: boolean;
}

interface ToolDef {
  name: string;
  method: string;
  path: string;
  queryParams?: string[];
  schema: Record<string, ToolSchemaField>;
}

interface DtoMapping {
  file: string;
  className: string;
}

// which DTO backs which tool's non-path schema fields. a tool with no
// entry here (list_platforms, get_platform, list_services, cancel_booking)
// takes nothing but path/query params with no real DTO behind them - the
// queryParams rule below still applies to those, just not the DTO diff.
const DTO_MAP: Record<string, DtoMapping> = {
  create_booking: { file: '../src/bookings/dto/create-booking.dto.ts', className: 'CreateBookingDto' },
  list_slots: { file: '../src/slots/dto/list-slots.query.ts', className: 'ListSlotsQuery' },
  list_bookings: { file: '../src/bookings/dto/list-bookings.query.ts', className: 'ListBookingsQuery' },
};

function inferPathParams(toolPath: string): string[] {
  return [...toolPath.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

function extractDtoFields(relativeFile: string): Record<string, { optional: boolean }> {
  const src = fs.readFileSync(path.join(__dirname, relativeFile), 'utf8');
  const fields: Record<string, { optional: boolean }> = {};
  const fieldRegex = /^\s*(\w+)(\?)?:\s*.+?;\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = fieldRegex.exec(src))) {
    const [, name, questionMark] = match;
    const precedingStart = Math.max(0, match.index - 250);
    const preceding = src.slice(precedingStart, match.index);
    fields[name] = { optional: Boolean(questionMark) || /@IsOptional\(\)/.test(preceding) };
  }
  return fields;
}

function main() {
  const doc = YAML.parse(fs.readFileSync(YAML_PATH, 'utf8')) as { tools: ToolDef[] };
  const problems: string[] = [];

  for (const tool of doc.tools) {
    const pathParams = new Set(inferPathParams(tool.path));
    const queryParams = new Set(tool.queryParams ?? []);
    const nonPathKeys = Object.keys(tool.schema).filter((k) => !pathParams.has(k));

    if (tool.method === 'GET' || tool.method === 'DELETE') {
      const droppedSilently = nonPathKeys.filter((k) => !queryParams.has(k));
      if (droppedSilently.length > 0) {
        problems.push(
          `[${tool.name}] ${tool.method} but ${JSON.stringify(droppedSilently)} ` +
            `missing from queryParams - will be silently dropped on every real call.`,
        );
      }
    }

    const mapping = DTO_MAP[tool.name];
    if (!mapping) continue;

    const dtoFields = extractDtoFields(mapping.file);
    const missingInYaml = Object.keys(dtoFields).filter((f) => !nonPathKeys.includes(f));
    const extraInYaml = nonPathKeys.filter((f) => !(f in dtoFields));

    if (missingInYaml.length > 0) {
      problems.push(
        `[${tool.name}] ${mapping.className} has ${JSON.stringify(missingInYaml)}, not in the yaml schema at all.`,
      );
    }
    if (extraInYaml.length > 0) {
      problems.push(
        `[${tool.name}] yaml schema has ${JSON.stringify(extraInYaml)}, not a real field on ${mapping.className}.`,
      );
    }

    for (const field of nonPathKeys) {
      if (!(field in dtoFields)) continue;
      const yamlOptional = Boolean(tool.schema[field]?.optional);
      const dtoOptional = dtoFields[field].optional;
      if (yamlOptional !== dtoOptional) {
        problems.push(
          `[${tool.name}] "${field}" optional=${dtoOptional} on ${mapping.className} ` +
            `but optional=${yamlOptional} in the yaml schema.`,
        );
      }
    }
  }

  if (problems.length === 0) {
    console.log('no drift found.');
    process.exit(0);
  }

  console.log(problems.join('\n'));
  console.log(`\n${problems.length} problem(s) found.`);
  process.exit(1);
}

main();
