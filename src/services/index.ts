import { OperationRegistry } from '@core/load/OperationRegistry';
import type { BaseService } from './BaseService';
import { AuthService } from './AuthService';
import { HealthService } from './HealthService';
import { OrderService } from './OrderService';
import { ProductService } from './ProductService';
import { UserService } from './UserService';

/** Add new services here - their operations become available to every feature file. */
const SERVICES: ReadonlyArray<new () => BaseService> = [
  HealthService,
  AuthService,
  UserService,
  ProductService,
  OrderService,
];

export function buildOperationRegistry(): OperationRegistry {
  const registry = new OperationRegistry();
  for (const Service of SERVICES) registry.register(...new Service().operations());
  return registry;
}

export { BaseService } from './BaseService';
export { SessionKeys } from './SessionKeys';
