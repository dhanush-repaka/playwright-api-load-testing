import { BearerTokenAuthProvider, NoAuthProvider } from '@core/auth/AuthProvider';
import { Given } from '@fixtures/index';

/*
 * Authentication is normally configured once per environment
 * (config/environments/<env>.json -> "auth"). These steps override it for a
 * single scenario, e.g. to test with a different role or without a token.
 * Steps take the *name* of an env var, never the token itself, so secrets
 * stay out of feature files, reports and version control.
 */

Given(
  'requests are authenticated with the bearer token from {string}',
  async ({ loadContext }, tokenEnvVar: string) => {
    loadContext.auth = BearerTokenAuthProvider.fromEnv({ type: 'bearer', tokenEnvVar });
  },
);

Given('requests are sent without authentication', async ({ loadContext }) => {
  loadContext.auth = new NoAuthProvider();
});
