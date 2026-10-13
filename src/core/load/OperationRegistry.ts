import type { Operation } from '@types';

/**
 * Central catalogue of named operations (Registry pattern).
 * Services register their operations here; feature files reference them by
 * name ("users.list", "orders.create"), decoupling Gherkin from code.
 */
export class OperationRegistry {
  private readonly operations = new Map<string, Operation>();

  register(...operations: Operation[]): this {
    for (const operation of operations) {
      if (this.operations.has(operation.name)) {
        throw new Error(`Operation "${operation.name}" is already registered`);
      }
      this.operations.set(operation.name, operation);
    }
    return this;
  }

  /** Registers or replaces an operation (used for ad-hoc endpoint steps). */
  upsert(operation: Operation): Operation {
    this.operations.set(operation.name, operation);
    return operation;
  }

  get(name: string): Operation {
    const operation = this.operations.get(name);
    if (!operation) {
      throw new Error(`Unknown operation "${name}". Registered: ${this.names().join(', ')}`);
    }
    return operation;
  }

  has(name: string): boolean {
    return this.operations.has(name);
  }

  names(): string[] {
    return [...this.operations.keys()].sort();
  }
}
