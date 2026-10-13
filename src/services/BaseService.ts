import type { ApiRequest, ApiResponse, Operation, VirtualUserContext } from '@types';
import { SessionKeys } from './SessionKeys';

export interface OperationDefinition {
  name: string;
  description?: string;
  expectedStatus?: number | number[];
  /** Builds the request for the current VU/iteration. */
  request: (vu: VirtualUserContext) => ApiRequest;
  /** Optional post-processing, e.g. extracting ids/tokens into the VU session. */
  onResponse?: (response: ApiResponse, vu: VirtualUserContext) => void;
}

/**
 * Base class for all API service objects.
 *
 * Subclasses describe *what* an endpoint needs (path, payload, auth) and
 * expose them as named Operations. Execution, timing and recording are
 * handled centrally by the LoadEngine - services never deal with metrics.
 */
export abstract class BaseService {
  /** Logical namespace, e.g. "users" -> operations "users.list", "users.create". */
  protected abstract readonly namespace: string;

  /** All operations this service contributes to the registry. */
  abstract operations(): Operation[];

  protected define(definition: OperationDefinition): Operation {
    const expected = definition.expectedStatus ?? 200;
    const name = `${this.namespace}.${definition.name}`;
    return {
      name,
      description: definition.description,
      expectedStatus: Array.isArray(expected) ? expected : [expected],
      execute: async (vu) => {
        const request = { ...definition.request(vu), label: name };
        const response = await vu.client.send(request);
        if (response.ok) definition.onResponse?.(response, vu);
        return response;
      },
    };
  }

  /** Bearer token stored in the VU session by AuthService. */
  protected token(vu: VirtualUserContext): string | undefined {
    return vu.session.get(SessionKeys.AUTH_TOKEN) as string | undefined;
  }
}
