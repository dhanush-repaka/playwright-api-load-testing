import type { VirtualUserContext } from '@types';
import { randomEmail, randomInt, randomString, uuid } from './random';

type Resolver = (args: string[], vu?: VirtualUserContext) => string | number;

/**
 * Resolves dynamic placeholders inside payload templates so every request
 * can carry unique, realistic data.
 *
 *   {{uuid}}               -> random UUID
 *   {{randomInt:1:100}}    -> integer between 1 and 100
 *   {{randomString:12}}    -> 12 random alphanumerics
 *   {{email}}              -> unique e-mail
 *   {{timestamp}}          -> epoch millis
 *   {{isoDate}}            -> ISO date-time
 *   {{vu.id}} / {{vu.iteration}}
 *   {{session.<key>}}      -> value previously stored in the VU session
 *   {{env.<NAME>}}         -> environment variable
 */
export class TemplateEngine {
  private static readonly resolvers: Record<string, Resolver> = {
    uuid: () => uuid(),
    randomInt: ([min = '0', max = '1000']) => randomInt(Number(min), Number(max)),
    randomString: ([length = '8']) => randomString(Number(length)),
    email: () => randomEmail(),
    timestamp: () => Date.now(),
    isoDate: () => new Date().toISOString(),
  };

  /** Extension point: register project-specific placeholders. */
  static register(name: string, resolver: Resolver): void {
    TemplateEngine.resolvers[name] = resolver;
  }

  static render<T>(template: T, vu?: VirtualUserContext): T {
    if (typeof template === 'string') return TemplateEngine.renderString(template, vu) as T;
    if (Array.isArray(template)) return template.map((item) => TemplateEngine.render(item, vu)) as T;
    if (template && typeof template === 'object') {
      return Object.fromEntries(
        Object.entries(template).map(([key, value]) => [key, TemplateEngine.render(value, vu)]),
      ) as T;
    }
    return template;
  }

  private static renderString(input: string, vu?: VirtualUserContext): string | number {
    // A string that is exactly one numeric placeholder keeps its numeric type.
    const whole = input.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
    if (whole) return TemplateEngine.resolve(whole[1], vu);
    return input.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr: string) => String(TemplateEngine.resolve(expr, vu)));
  }

  private static resolve(expression: string, vu?: VirtualUserContext): string | number {
    if (expression.startsWith('vu.')) {
      const key = expression.slice(3) as 'id' | 'iteration';
      return vu?.[key] ?? 0;
    }
    if (expression.startsWith('session.')) {
      return String(vu?.session.get(expression.slice(8)) ?? '');
    }
    if (expression.startsWith('env.')) {
      return process.env[expression.slice(4)] ?? '';
    }
    const [name, ...args] = expression.split(':');
    const resolver = TemplateEngine.resolvers[name];
    if (!resolver) throw new Error(`Unknown template placeholder "{{${expression}}}"`);
    return resolver(args, vu);
  }
}
