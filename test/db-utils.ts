import Database from 'better-sqlite3';

/**
 * Creates an isolated in-memory SQLite database instance for testing.
 * 
 * Returns a new `:memory:` instance per call to ensure Test-Driven Development (TDD)
 * isolation requirements. No singletons allowed.
 *
 * @returns A fresh Database instance
 */
export function createTestDb(): Database.Database {
  return new Database(':memory:');
}
