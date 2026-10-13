import type { Operation } from '@types';
import { RequestBuilder } from '@core/http/RequestBuilder';
import { TestDataManager } from '@core/data/TestDataManager';
import { BaseService } from './BaseService';
import { SessionKeys } from './SessionKeys';

interface Credentials {
  username: string;
  password: string;
}

export class AuthService extends BaseService {
  protected readonly namespace = 'auth';

  /** Each VU logs in with its own account (stable per-user mapping). */
  private readonly credentials = TestDataManager.feeder<Credentials>('users', 'per-user');

  operations(): Operation[] {
    return [
      this.define({
        name: 'login',
        description: 'Authenticate and store the bearer token in the VU session',
        request: (vu) => RequestBuilder.post('/api/auth/login').withBody(this.credentials(vu)).build(),
        onResponse: (response, vu) => {
          const body = response.body as { token?: string } | null;
          if (body?.token) vu.session.set(SessionKeys.AUTH_TOKEN, body.token);
        },
      }),
    ];
  }
}
