import type { Operation } from '@types';
import { RequestBuilder } from '@core/http/RequestBuilder';
import { BaseService } from './BaseService';

export class HealthService extends BaseService {
  protected readonly namespace = 'health';

  operations(): Operation[] {
    return [
      this.define({
        name: 'check',
        description: 'Liveness probe',
        request: () => RequestBuilder.get('/health').build(),
      }),
    ];
  }
}
