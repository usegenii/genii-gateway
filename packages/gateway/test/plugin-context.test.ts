import assert from 'node:assert/strict';
import test from 'node:test';

import { createEventBus, type GatewayEventBus } from '../src/event-bus.ts';
import { createPluginContext } from '../src/plugin-context.ts';
import {
	createServiceRegistry,
	type GatewayServiceRegistry,
	serviceToken,
} from '../src/plugin-services.ts';

declare module '../src/event-bus.ts' {
	interface GatewayEventMap {
		'genii:context-test': { readonly value: string };
	}
}

test('awaits deferred effects in last-in, first-out order', async () => {
	const owner = createPluginContext(
		'example',
		createEventBus(),
		createServiceRegistry(),
	);
	const calls: string[] = [];

	owner.context.defer(async () => {
		await Promise.resolve();
		calls.push('first');
	});
	owner.context.defer(async () => {
		await Promise.resolve();
		calls.push('second');
	});

	await owner.dispose();

	assert.deepEqual(calls, ['second', 'first']);
});

test('disposes effects, subscriptions, and services in order despite failure', async () => {
	const actualEventBus = createEventBus();
	const actualServiceRegistry = createServiceRegistry();
	const order: string[] = [];
	const eventBus: GatewayEventBus = {
		...actualEventBus,
		removeOwner(pluginId) {
			order.push('events');
			actualEventBus.removeOwner(pluginId);
		},
	};
	const serviceRegistry: GatewayServiceRegistry = {
		...actualServiceRegistry,
		removeOwner(pluginId) {
			order.push('services');
			actualServiceRegistry.removeOwner(pluginId);
		},
	};
	const owner = createPluginContext('example', eventBus, serviceRegistry);
	const token = serviceToken<string>('owned');
	let eventCalls = 0;
	const failure = new Error('cleanup failed');

	owner.context.events.on('genii:context-test', () => {
		eventCalls += 1;
	});
	owner.context.services.provide(token, 'value');
	await actualEventBus
		.eventsFor('emitter')
		.emit('genii:context-test', { value: 'received' });
	assert.equal(eventCalls, 1);
	assert.equal(
		actualServiceRegistry.servicesFor('consumer').get(token),
		'value',
	);
	assert.equal('removeOwner' in owner.context.events, false);
	assert.equal('removeOwner' in owner.context.services, false);
	assert.equal('dispose' in owner.context, false);
	owner.context.defer(() => {
		order.push('effects');
		throw failure;
	});

	await assert.rejects(owner.dispose(), (error) => error === failure);
	await actualEventBus
		.eventsFor('emitter')
		.emit('genii:context-test', { value: 'ignored' });

	assert.deepEqual(order, ['effects', 'events', 'services']);
	assert.equal(eventCalls, 1);
	assert.throws(
		() => actualServiceRegistry.servicesFor('consumer').get(token),
		/Unknown service token/,
	);
});

test('disposal is idempotent when a deferred effect reenters it', async () => {
	const eventBus = createEventBus();
	const serviceRegistry = createServiceRegistry();
	const owner = createPluginContext('example', eventBus, serviceRegistry);
	const token = serviceToken<string>('reentrant');
	let eventCalls = 0;
	let reentrantDisposal: Promise<void> | undefined;

	owner.context.events.on('genii:context-test', () => {
		eventCalls += 1;
	});
	owner.context.services.provide(token, 'value');
	owner.context.defer(async () => {
		reentrantDisposal = owner.dispose();
		await eventBus
			.eventsFor('observer')
			.emit('genii:context-test', { value: 'during cleanup' });
		assert.equal(
			serviceRegistry.servicesFor('observer').get(token),
			'value',
		);
	});

	const disposal = owner.dispose();
	await disposal;

	assert.equal(reentrantDisposal, disposal);
	assert.equal(owner.dispose(), disposal);
	assert.equal(eventCalls, 1);
});

test('rejects defer once cleanup starts and all context use after disposal', async () => {
	const owner = createPluginContext(
		'example',
		createEventBus(),
		createServiceRegistry(),
	);
	const started = Promise.withResolvers<void>();
	const finish = Promise.withResolvers<void>();
	const token = serviceToken<string>('disposed');

	owner.context.defer(async () => {
		started.resolve();
		await finish.promise;
	});
	const disposal = owner.dispose();
	await started.promise;

	assert.throws(() => owner.context.defer(() => undefined), /disposed/);
	finish.resolve();
	await disposal;

	assert.throws(
		() => owner.context.events.on('genii:context-test', () => undefined),
		/disposed/,
	);
	await assert.rejects(
		owner.context.events.emit('genii:context-test', { value: 'ignored' }),
		/disposed/,
	);
	assert.throws(() => owner.context.services.get(token), /disposed/);
	assert.throws(
		() => owner.context.services.provide(token, 'ignored'),
		/disposed/,
	);
});
