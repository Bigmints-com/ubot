export type {
  DatabaseConfig,
  DatabaseConnection,
  DatabaseOptions,
  DatabaseStats,
  DatabaseEvent,
  DatabaseEventListener,
  Migration,
  MigrationRecord,
  QueryResult,
  Repository,
  TableSchema,
  ColumnSchema,
  IndexSchema,
} from './types.js';

export {
  SQLiteDatabase,
  createConnection,
  createDefaultConfig,
} from './connection.js';

export {
  BaseRepository,
  BaseEntity,
  createRepository,
} from './repository.js';

export {
  defaultMigrations,
  createMigration,
  createTableMigration,
  getMigrationStatus,
} from './migrations.js';