import type { HttpMethod, Operation } from '@types';
import { RequestBuilder } from '@core/http/RequestBuilder';
import { TestDataManager } from '@core/data/TestDataManager';

const ENDPOINT_PATTERN = /^(GET|POST|PUT|PATCH|DELETE|HEAD)\s+(\/\S*)$/i;

export interface EndpointOptions {
  payloadTemplate?: string;
  expectedStatus?: number[];
  headers?: Record<string, string>;
}

/**
 * Builds ad-hoc operations straight from Gherkin ("GET /api/products") so
 * new endpoints can be load tested without writing a service class first.
 */
export const EndpointOperation = {
  isEndpoint(reference: string): boolean {
    return ENDPOINT_PATTERN.test(reference.trim());
  },

  create(reference: string, options: EndpointOptions = {}): Operation {
    const match = reference.trim().match(ENDPOINT_PATTERN);
    if (!match) throw new Error(`"${reference}" is not a valid endpoint reference (e.g. "GET /api/users")`);
    const method = match[1].toUpperCase() as HttpMethod;
    const [path, queryString] = match[2].split('?');
    const query = Object.fromEntries(new URLSearchParams(queryString ?? ''));
    const expectedStatus = options.expectedStatus ?? [method === 'POST' ? 201 : 200];
    const name = `${method} ${path}`;

    return {
      name,
      expectedStatus,
      execute: (vu) => {
        const builder = RequestBuilder.of(method, path)
          .withQuery(query)
          .withHeaders(options.headers ?? {})
          .withLabel(name);
        if (options.payloadTemplate) builder.withBody(TestDataManager.payload(options.payloadTemplate, vu));
        return vu.client.send(builder.build());
      },
    };
  },
};
