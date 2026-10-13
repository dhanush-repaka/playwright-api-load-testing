import { expect, test } from '@playwright/test';
import { parseDuration } from '@utils/duration';
import { TemplateEngine } from '@utils/TemplateEngine';
import { RequestBuilder } from '@core/http/RequestBuilder';
import type { VirtualUserContext } from '@types';

test.describe('parseDuration', () => {
  for (const [input, expected] of [
    ['250ms', 250],
    ['30s', 30_000],
    ['1.5 minutes', 90_000],
    ['2m', 120_000],
    ['1h', 3_600_000],
    ['400', 400],
  ] as const) {
    test(`"${input}" -> ${expected}ms`, () => expect(parseDuration(input)).toBe(expected));
  }

  test('rejects unknown units', () => expect(() => parseDuration('5 fortnights')).toThrow());
});

test.describe('TemplateEngine', () => {
  const vu = { id: 7, iteration: 3, session: new Map([['token', 'abc']]) } as unknown as VirtualUserContext;

  test('renders nested placeholders and preserves numeric types', () => {
    const rendered = TemplateEngine.render(
      {
        name: 'user-{{vu.id}}-{{vu.iteration}}',
        qty: '{{randomInt:5:5}}',
        auth: '{{session.token}}',
        tags: ['{{vu.id}}'],
      },
      vu,
    );
    expect(rendered).toEqual({ name: 'user-7-3', qty: 5, auth: 'abc', tags: [7] });
  });

  test('fails fast on unknown placeholders', () => {
    expect(() => TemplateEngine.render('{{doesNotExist}}')).toThrow(/Unknown template placeholder/);
  });
});

test.describe('RequestBuilder', () => {
  test('builds requests fluently', () => {
    const request = RequestBuilder.get('/api/users/:id')
      .withPathParams({ id: 42 })
      .withQuery({ expand: 'orders', skip: undefined })
      .withBearer('t0ken')
      .build();
    expect(request).toMatchObject({
      method: 'GET',
      path: '/api/users/42',
      query: { expand: 'orders' },
      headers: { Authorization: 'Bearer t0ken' },
    });
  });
});
