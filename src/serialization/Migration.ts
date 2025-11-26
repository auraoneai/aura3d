import { Logger } from '../core/Logger';

const logger = Logger.create('Migration');

/**
 * Migration function signature
 */
export type MigrationFunction = (data: any) => any;

/**
 * Migration definition
 */
export interface MigrationDefinition {
  /** Source version */
  from: number;
  /** Target version */
  to: number;
  /** Migration function */
  migrate: MigrationFunction;
  /** Migration description */
  description?: string;
}

/**
 * Save data version migration
 * Handles upgrading save data between versions
 */
export class Migration {
  private migrations: Map<number, MigrationDefinition[]> = new Map();

  /**
   * Registers a migration
   */
  register(migration: MigrationDefinition): void {
    const existing = this.migrations.get(migration.from) || [];
    existing.push(migration);
    this.migrations.set(migration.from, existing);

    logger.debug(`Registered migration: v${migration.from} -> v${migration.to}`);
  }

  /**
   * Migrates data from one version to another
   */
  migrate(data: any, fromVersion: number, toVersion: number): any {
    if (fromVersion === toVersion) {
      return data;
    }

    if (fromVersion > toVersion) {
      throw new Error('Cannot migrate to older version');
    }

    logger.info(`Migrating data from v${fromVersion} to v${toVersion}`);

    let currentData = data;
    let currentVersion = fromVersion;

    while (currentVersion < toVersion) {
      const migrations = this.migrations.get(currentVersion);

      if (!migrations || migrations.length === 0) {
        throw new Error(`No migration path from v${currentVersion}`);
      }

      const migration = migrations.find(m => m.to <= toVersion);

      if (!migration) {
        throw new Error(`No migration path from v${currentVersion} to v${toVersion}`);
      }

      logger.debug(`Applying migration: v${migration.from} -> v${migration.to}`);

      try {
        currentData = migration.migrate(currentData);
        currentVersion = migration.to;
      } catch (error) {
        logger.error(`Migration failed: v${migration.from} -> v${migration.to}`, error);
        throw error;
      }
    }

    logger.info(`Migration completed: v${fromVersion} -> v${toVersion}`);
    return currentData;
  }

  /**
   * Checks if migration path exists
   */
  canMigrate(fromVersion: number, toVersion: number): boolean {
    if (fromVersion === toVersion) {
      return true;
    }

    if (fromVersion > toVersion) {
      return false;
    }

    let currentVersion = fromVersion;

    while (currentVersion < toVersion) {
      const migrations = this.migrations.get(currentVersion);

      if (!migrations || migrations.length === 0) {
        return false;
      }

      const migration = migrations.find(m => m.to <= toVersion);

      if (!migration) {
        return false;
      }

      currentVersion = migration.to;
    }

    return true;
  }

  /**
   * Gets all registered migrations
   */
  getMigrations(): MigrationDefinition[] {
    const all: MigrationDefinition[] = [];

    for (const migrations of this.migrations.values()) {
      all.push(...migrations);
    }

    return all;
  }

  /**
   * Clears all migrations
   */
  clear(): void {
    this.migrations.clear();
  }
}
