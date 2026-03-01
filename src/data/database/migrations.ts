import type { Migration, TableSchema, DatabaseConnection } from './types.js';

export const defaultMigrations: Migration[] = [
  {
    id: '001',
    name: 'initial_schema',
    up: `
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'idle',
        priority TEXT NOT NULL DEFAULT 'medium',
        config TEXT,
        stats TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
      CREATE INDEX IF NOT EXISTS idx_agents_priority ON agents(priority);

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        agent_id TEXT,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT NOT NULL DEFAULT 'medium',
        progress INTEGER DEFAULT 0,
        data TEXT,
        result TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks(agent_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

      CREATE TABLE IF NOT EXISTS config_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'database',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
    down: `
      DROP TABLE IF EXISTS config_store;
      DROP TABLE IF EXISTS tasks;
      DROP TABLE IF EXISTS agents;
    `,
  },
  {
    id: '002',
    name: 'capability_log',
    up: `
      CREATE TABLE IF NOT EXISTS capability_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        module_name TEXT,
        triage_verdict TEXT,
        triage_reason TEXT,
        test_passed INTEGER,
        test_details TEXT,
        request TEXT,
        session_id TEXT,
        source TEXT DEFAULT 'web',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_caplog_action ON capability_log(action);
      CREATE INDEX IF NOT EXISTS idx_caplog_module ON capability_log(module_name);
    `,
    down: `
      DROP TABLE IF EXISTS capability_log;
    `,
  },
];

export function createMigration(
  id: string,
  name: string,
  up: string,
  down: string
): Migration {
  return { id, name, up, down };
}

export function createTableMigration(schema: TableSchema): Migration {
  const columns = schema.columns.map(col => {
    let def = `${col.name} ${col.type}`;
    if (col.primaryKey) def += ' PRIMARY KEY';
    if (col.autoIncrement) def += ' AUTOINCREMENT';
    if (col.notNull) def += ' NOT NULL';
    if (col.unique) def += ' UNIQUE';
    if (col.defaultValue !== undefined) {
      def += ` DEFAULT ${typeof col.defaultValue === 'string' ? `'${col.defaultValue}'` : col.defaultValue}`;
    }
    return def;
  });

  let upSql = `CREATE TABLE IF NOT EXISTS ${schema.name} (${columns.join(', ')})`;

  if (schema.indexes) {
    for (const index of schema.indexes) {
      const unique = index.unique ? 'UNIQUE' : '';
      const cols = index.columns.join(', ');
      upSql += `;\nCREATE ${unique} INDEX IF NOT EXISTS ${index.name} ON ${schema.name} (${cols})`;
    }
  }

  const downSql = `DROP TABLE IF EXISTS ${schema.name}`;

  return createMigration(
    `table_${schema.name}`,
    `create_table_${schema.name}`,
    upSql,
    downSql
  );
}

export function getMigrationStatus(db: DatabaseConnection): {
  applied: string[];
  pending: string[];
} {
  const applied = db
    .query<{ id: string }>('SELECT id FROM _migrations ORDER BY id')
    .map(r => r.id);

  const allIds = defaultMigrations.map(m => m.id);
  const pending = allIds.filter(id => !applied.includes(id));

  return { applied, pending };
}