import type { Operation } from '@types';
import { RequestBuilder } from '@core/http/RequestBuilder';
import { TestDataManager } from '@core/data/TestDataManager';
import { randomInt } from '@utils/random';
import { BaseService } from './BaseService';
import { SessionKeys } from './SessionKeys';

interface SearchTerm {
  term: string;
  category: string;
}

export class ProductService extends BaseService {
  protected readonly namespace = 'products';

  private readonly searchTerms = TestDataManager.feeder<SearchTerm>('search-terms', 'random');

  operations(): Operation[] {
    return [
      this.define({
        name: 'list',
        description: 'Browse catalogue by category',
        request: (vu) =>
          RequestBuilder.get('/api/products')
            .withQuery({ category: this.searchTerms(vu).category, page: randomInt(1, 3) })
            .build(),
        onResponse: (response, vu) => {
          const items = (response.body as { items?: { id: number }[] } | null)?.items;
          if (items?.length) vu.session.set(SessionKeys.LAST_PRODUCT_ID, items[0].id);
        },
      }),
      this.define({
        name: 'search',
        description: 'Free-text product search (data-driven terms)',
        request: (vu) =>
          RequestBuilder.get('/api/products/search')
            .withQuery({ q: this.searchTerms(vu).term })
            .build(),
      }),
      this.define({
        name: 'getById',
        description: 'Product details page',
        request: (vu) =>
          RequestBuilder.get('/api/products/:id')
            .withPathParams({ id: (vu.session.get(SessionKeys.LAST_PRODUCT_ID) as number) ?? randomInt(1, 50) })
            .build(),
      }),
    ];
  }
}
