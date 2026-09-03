import assert from 'node:assert/strict';
import test from 'node:test';

import { type ServiceToken, serviceToken } from '../src/index.ts';
import { createServiceRegistry } from '../src/plugin-services.ts';

test('provides and gets typed service values', () => {
	const services = createServiceRegistry().servicesFor('provider');
	const config = serviceToken<{ readonly port: number }>('config');

	services.provide(config, { port: 8787 });
	const value: { readonly port: number } = services.get(config);

	assert.deepEqual(value, { port: 8787 });
});

test('tokens with the same description are unique', () => {
	const services = createServiceRegistry().servicesFor('provider');
	const first = serviceToken<string>('shared');
	const second = serviceToken<string>('shared');

	services.provide(first, 'first');
	services.provide(second, 'second');

	assert.equal(services.get(first), 'first');
	assert.equal(services.get(second), 'second');
});

test('service tokens are invariant in their value type', () => {
	const token = serviceToken<string>('invariant');
	// @ts-expect-error A token cannot be widened to a different value type.
	const widerToken: ServiceToken<unknown> = token;
	const unknownToken = serviceToken<unknown>('unknown');
	// @ts-expect-error A token cannot be narrowed to a different value type.
	const narrowerToken: ServiceToken<string> = unknownToken;

	assert.equal(widerToken, token);
	assert.equal(narrowerToken, unknownToken);
});

test('rejects duplicate provision from any owner', () => {
	const registry = createServiceRegistry();
	const token = serviceToken<string>('router');
	registry.servicesFor('first').provide(token, 'first');

	assert.throws(
		() => registry.servicesFor('second').provide(token, 'second'),
		/already provided/,
	);
});

test('rejects unknown service tokens', () => {
	const services = createServiceRegistry().servicesFor('consumer');

	assert.throws(
		() => services.get(serviceToken<string>('missing')),
		/Unknown service token/,
	);
});

test('removes only services provided by the disposed owner', () => {
	const registry = createServiceRegistry();
	const first = registry.servicesFor('first');
	const second = registry.servicesFor('second');
	const firstToken = serviceToken<string>('first');
	const anotherFirstToken = serviceToken<string>('another first');
	const secondToken = serviceToken<string>('second');

	first.provide(firstToken, 'first value');
	first.provide(anotherFirstToken, 'another first value');
	second.provide(secondToken, 'second value');
	registry.removeOwner('first');

	assert.throws(() => second.get(firstToken), /Unknown service token/);
	assert.throws(() => second.get(anotherFirstToken), /Unknown service token/);
	assert.equal(second.get(secondToken), 'second value');
});

test('rejects get and provide after owner disposal', () => {
	const registry = createServiceRegistry();
	const services = registry.servicesFor('provider');
	const token = serviceToken<string>('service');
	services.provide(token, 'value');

	registry.removeOwner('provider');

	assert.throws(() => services.get(token), /disposed/);
	assert.throws(() => services.provide(token, 'replacement'), /disposed/);
});
