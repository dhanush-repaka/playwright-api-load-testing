import type { ApiRequest, HttpMethod } from '@types';

/**
 * Fluent builder for ApiRequest objects (Builder pattern).
 *
 *   RequestBuilder.post('/api/users').withBody(payload).withBearer(token).build()
 */
export class RequestBuilder {
  private readonly request: ApiRequest;

  private constructor(method: HttpMethod, path: string) {
    this.request = { method, path, headers: {}, query: {} };
  }

  static of(method: HttpMethod, path: string): RequestBuilder {
    return new RequestBuilder(method, path);
  }

  static get(path: string): RequestBuilder {
    return new RequestBuilder('GET', path);
  }

  static post(path: string): RequestBuilder {
    return new RequestBuilder('POST', path);
  }

  static put(path: string): RequestBuilder {
    return new RequestBuilder('PUT', path);
  }

  static delete(path: string): RequestBuilder {
    return new RequestBuilder('DELETE', path);
  }

  /** Replaces ":name" segments, e.g. withPathParams({ id: 7 }) on "/users/:id". */
  withPathParams(params: Record<string, string | number>): this {
    this.request.path = Object.entries(params).reduce(
      (path, [key, value]) => path.replace(`:${key}`, encodeURIComponent(String(value))),
      this.request.path,
    );
    return this;
  }

  withQuery(query: Record<string, string | number | boolean | undefined>): this {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) this.request.query![key] = value;
    }
    return this;
  }

  withHeader(name: string, value: string): this {
    this.request.headers![name] = value;
    return this;
  }

  withHeaders(headers: Record<string, string>): this {
    Object.assign(this.request.headers!, headers);
    return this;
  }

  withBearer(token: string | undefined): this {
    if (token) this.request.headers!.Authorization = `Bearer ${token}`;
    return this;
  }

  withBody(body: unknown): this {
    this.request.body = body;
    return this;
  }

  withTimeout(timeoutMs: number): this {
    this.request.timeoutMs = timeoutMs;
    return this;
  }

  withLabel(label: string): this {
    this.request.label = label;
    return this;
  }

  build(): ApiRequest {
    return structuredClone(this.request);
  }
}
