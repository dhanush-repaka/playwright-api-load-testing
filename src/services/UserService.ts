import type { Operation } from '@types';
import { RequestBuilder } from '@core/http/RequestBuilder';
import { TestDataManager } from '@core/data/TestDataManager';
import { randomInt } from '@utils/random';
import { BaseService } from './BaseService';
import { SessionKeys } from './SessionKeys';

export class UserService extends BaseService {
  protected readonly namespace = 'users';

  operations(): Operation[] {
    return [
      this.define({
        name: 'list',
        description: 'Paginated user listing',
        request: () =>
          RequestBuilder.get('/api/users')
            .withQuery({ page: randomInt(1, 5), limit: 20 })
            .build(),
      }),
      this.define({
        name: 'getById',
        description: 'Fetch a single user (prefers the one this VU created)',
        request: (vu) =>
          RequestBuilder.get('/api/users/:id')
            .withPathParams({ id: (vu.session.get(SessionKeys.LAST_USER_ID) as number) ?? randomInt(1, 100) })
            .build(),
      }),
      this.define({
        name: 'create',
        description: 'Create a user from the payload template',
        expectedStatus: 201,
        request: (vu) =>
          RequestBuilder.post('/api/users').withBody(TestDataManager.payload('users/create-user.json', vu)).build(),
        onResponse: (response, vu) => {
          const body = response.body as { id?: number } | null;
          if (body?.id) vu.session.set(SessionKeys.LAST_USER_ID, body.id);
        },
      }),
      this.define({
        name: 'update',
        description: 'Update a user profile',
        request: (vu) =>
          RequestBuilder.put('/api/users/:id')
            .withPathParams({ id: (vu.session.get(SessionKeys.LAST_USER_ID) as number) ?? randomInt(1, 100) })
            .withBody(TestDataManager.payload('users/update-user.json', vu))
            .build(),
      }),
    ];
  }
}
