import { expect, test } from '@playwright/test';
import { ConfigManager } from '@config/ConfigManager';

test.describe('ConfigManager load profiles', () => {
  test.afterEach(() => {
    delete process.env.VU_MULTIPLIER;
  });

  test('applies overrides on top of a named profile', () => {
    const profile = ConfigManager.get().getLoadProfile('load', { virtualUsers: 3, durationMs: 4_000, rampUpMs: 0 });
    expect(profile).toMatchObject({ name: 'load', virtualUsers: 3, durationMs: 4_000 });
  });

  test('rejects an invalid VU_MULTIPLIER instead of running with NaN users', () => {
    process.env.VU_MULTIPLIER = 'abc';
    expect(() => ConfigManager.get().getLoadProfile('smoke')).toThrow(/VU_MULTIPLIER must be a positive number/);
  });

  test('rejects unknown profiles and impossible settings', () => {
    expect(() => ConfigManager.get().getLoadProfile('nope')).toThrow(/Unknown load profile/);
    expect(() => ConfigManager.get().getLoadProfile('smoke', { rampUpMs: 60_000 })).toThrow(/rampUpMs cannot exceed/);
  });
});
