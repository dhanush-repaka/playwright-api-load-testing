import type { Operation } from '@types';
import { RequestBuilder } from '@core/http/RequestBuilder';
import { TestDataManager } from '@core/data/TestDataManager';
import { BaseService } from './BaseService';
import { SessionKeys } from './SessionKeys';

export class OrderService extends BaseService {
  protected readonly namespace = 'orders';

  operations(): Operation[] {
    return [
      this.define({
        name: 'create',
        description: 'Place an order (requires auth.login in setup)',
        expectedStatus: 201,
        request: (vu) =>
          RequestBuilder.post('/api/orders')
            .withBearer(this.token(vu))
            .withBody(TestDataManager.payload('orders/create-order.json', vu))
            .build(),
        onResponse: (response, vu) => {
          const body = response.body as { id?: string } | null;
          if (body?.id) vu.session.set(SessionKeys.LAST_ORDER_ID, body.id);
        },
      }),
      this.define({
        name: 'getById',
        description: 'Order status lookup for the last order placed by this VU',
        request: (vu) =>
          RequestBuilder.get('/api/orders/:id')
            .withBearer(this.token(vu))
            .withPathParams({ id: String(vu.session.get(SessionKeys.LAST_ORDER_ID) ?? 'unknown') })
            .build(),
      }),
    ];
  }
}
