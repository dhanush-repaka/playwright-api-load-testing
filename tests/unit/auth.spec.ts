import { expect, test } from '@playwright/test';
import { BearerTokenAuthProvider, createAuthProvider, maskSecret, NoAuthProvider } from '@core/auth/AuthProvider';
import type { APIRequestContext } from '@playwright/test';

const noHttp = {} as APIRequestContext;

test.describe('Auth providers', () => {
  test.afterEach(() => {
    delete process.env.TEST_TOKEN;
  });

  test('bearer token is sent as "Authorization: Bearer <token>"', async () => {
    process.env.TEST_TOKEN = 'abc123token';
    const provider = createAuthProvider({ type: 'bearer', tokenEnvVar: 'TEST_TOKEN' }, noHttp);
    expect(await provider.headers()).toEqual({ Authorization: 'Bearer abc123token' });
  });

  test('a pasted "Bearer " prefix is not duplicated', async () => {
    const provider = new BearerTokenAuthProvider('Bearer abc123token');
    expect(await provider.headers()).toEqual({ Authorization: 'Bearer abc123token' });
  });

  test('custom header name and raw token scheme are supported', async () => {
    const provider = new BearerTokenAuthProvider('k3y-value', { headerName: 'X-Api-Key', scheme: '' });
    expect(await provider.headers()).toEqual({ 'X-Api-Key': 'k3y-value' });
  });

  test('missing token fails fast with the env var name', () => {
    expect(() => createAuthProvider({ type: 'bearer', tokenEnvVar: 'TEST_TOKEN' }, noHttp)).toThrow(/TEST_TOKEN/);
  });

  test('oauth2 without client credentials fails fast', () => {
    expect(() =>
      createAuthProvider(
        { type: 'oauth2', tokenUrl: '/oauth/token', clientIdEnvVar: 'NO_ID', clientSecretEnvVar: 'NO_SECRET' },
        noHttp,
      ),
    ).toThrow(/NO_ID and NO_SECRET/);
  });

  test('no auth sends no headers', async () => {
    expect(await new NoAuthProvider().headers()).toEqual({});
  });

  test('secrets are masked in logs', () => {
    expect(maskSecret('eyJhbGciOiJIUzI1NiJ9.payload.sig9Qk')).toBe('eyJh…g9Qk');
    expect(maskSecret('short')).toBe('****');
  });
});
