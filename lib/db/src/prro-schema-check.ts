import { SQL } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import type { PoolClient } from "pg";
import { prroRegistersTable, prroShiftsTable, fiscalDocumentsTable, fiscalEventsTable } from "./schema/prro";

const dialect = new PgDialect();
const tables = [prroRegistersTable, prroShiftsTable, fiscalDocumentsTable, fiscalEventsTable];
// PostgreSQL adds casts/parentheses while deparsing stored expressions.
const normalize = (value: string) => value
  .replace(/::(?:character varying|text|jsonb|timestamp with time zone)(?:\[\])?/g, "")
  .replace(/[()\s"]/g, "");
const typeName = (value: string) => value.replace("character varying", "varchar")
  .replace("timestamp with time zone", "timestamptz").replace(/\s/g, "");

function defaultExpression(value: unknown): string | null {
  if (value === undefined) return null;
  if (value instanceof SQL) return dialect.sqlToQuery(value).sql;
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  if (typeof value === "object") return `'${JSON.stringify(value)}'::jsonb`;
  return String(value);
}

/** Read-only contract check, including constraints relied on for fiscal safety. */
export async function assertPrroSchema(client: PoolClient) {
  const errors: string[] = [];
  for (const table of tables) {
    const config = getTableConfig(table);
    const { rows: columns } = await client.query<{
      name: string; type: string; not_null: boolean; default_value: string | null;
    }>(`
      SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
             a.attnotnull AS not_null, pg_get_expr(d.adbin, d.adrelid) AS default_value
      FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = to_regclass($1) AND a.attnum > 0 AND NOT a.attisdropped
    `, [config.name]);
    for (const expected of config.columns) {
      const actual = columns.find(column => column.name === expected.name);
      const prefix = `${config.name}.${expected.name}`;
      if (!actual) { errors.push(`${prefix}: missing column`); continue; }
      const expectedType = expected.getSQLType() === "serial" ? "integer" : expected.getSQLType();
      if (typeName(actual.type) !== typeName(expectedType) || actual.not_null !== expected.notNull) {
        errors.push(`${prefix}: incompatible type/nullability`);
      }
      const expectedDefault = defaultExpression(expected.default);
      if (expected.getSQLType() === "serial") {
        if (!actual.default_value?.startsWith("nextval(")) errors.push(`${prefix}: missing sequence default`);
      } else if (normalize(actual.default_value ?? "") !== normalize(expectedDefault ?? "")) {
        errors.push(`${prefix}: incompatible default`);
      }
    }
    const { rows: indexes } = await client.query<{
      name: string; unique: boolean; primary: boolean; valid: boolean;
      columns: string[]; predicate: string | null; method: string;
    }>(`
      SELECT ci.relname AS name, i.indisunique AS unique, i.indisprimary AS primary,
        (i.indisvalid AND i.indisready) AS valid, am.amname AS method,
        ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
          ORDER BY k.ord) AS columns,
        pg_get_expr(i.indpred, i.indrelid) AS predicate
      FROM pg_index i JOIN pg_class ci ON ci.oid = i.indexrelid
      JOIN pg_am am ON am.oid = ci.relam
      WHERE i.indrelid = to_regclass($1)
    `, [config.name]);
    const primaryColumns = config.columns.filter(c => c.primary).map(c => c.name);
    if (!indexes.some(i => i.primary && i.valid && JSON.stringify(i.columns) === JSON.stringify(primaryColumns))) {
      errors.push(`${config.name}: missing primary key`);
    }
    for (const index of config.indexes) {
      const expected = index.config;
      const columnNames = expected.columns.map(c => "name" in c ? c.name : "");
      const actual = indexes.find(i => i.name === expected.name);
      const predicate = expected.where ? dialect.sqlToQuery(expected.where).sql : "";
      // IN (...) is deparsed by PostgreSQL as = ANY (ARRAY[...]).
      const predicateKey = (v: string) => normalize(v)
        .replaceAll(`${config.name}.`, "")
        .replace(/=ANYARRAY\[/g, "IN").replace(/\]/g, "");
      if (!actual || !actual.valid || actual.unique !== expected.unique ||
        actual.method !== expected.method ||
        JSON.stringify(actual.columns) !== JSON.stringify(columnNames) ||
        predicateKey(actual.predicate ?? "") !== predicateKey(predicate)) {
        errors.push(`${config.name}: incompatible index ${expected.name} (predicate: ${actual?.predicate ?? "none"}; expected: ${predicate || "none"})`);
      }
    }
    const { rows: foreignKeys } = await client.query<{
      columns: string[]; target: string; target_columns: string[];
      delete_action: string; update_action: string; valid: boolean; deferred: boolean;
    }>(`
      SELECT ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n, ord)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.ord) AS columns,
        c.confrelid::regclass::text AS target,
        ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n, ord)
        JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.n ORDER BY k.ord) AS target_columns,
        c.confdeltype AS delete_action, c.confupdtype AS update_action,
        c.convalidated AS valid, c.condeferrable AS deferred
      FROM pg_constraint c WHERE c.conrelid = to_regclass($1) AND c.contype = 'f'
    `, [config.name]);
    const action = (value: string | undefined) =>
      ({ cascade: "c", restrict: "r", "set null": "n", "set default": "d" })[value ?? ""] ?? "a";
    for (const key of config.foreignKeys) {
      const reference = key.reference();
      const names = reference.columns.map(c => c.name);
      const targetNames = reference.foreignColumns.map(c => c.name);
      const target = getTableConfig(reference.foreignTable).name;
      if (!foreignKeys.some(k => JSON.stringify(k.columns) === JSON.stringify(names) &&
        k.target === target && JSON.stringify(k.target_columns) === JSON.stringify(targetNames) &&
        k.delete_action === action(key.onDelete) && k.update_action === action(key.onUpdate) &&
        k.valid && !k.deferred)) errors.push(`${config.name}: incompatible foreign key (${names.join(",")})`);
    }
  }
  if (errors.length) throw new Error(`Incompatible PRRO schema:\n${errors.join("\n")}`);
}
