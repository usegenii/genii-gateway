import assert from 'node:assert/strict';
import test from 'node:test';

import { createEventBus, type GatewayEventMap } from '../src/event-bus.ts';

declare module '../src/event-bus.ts' {
	interface GatewayEventMap {
		'genii:message': { readonly text: string };
		'plugin:@usegenii/example:ready': { readonly attempt: number };
	}
}

type EventName = keyof GatewayEventMap & string;

test('delivers typed payloads to asynchronous handlers in registration order', async () => {
	const bus = createEventBus();
	const events = bus.eventsFor('example');
	const calls: string[] = [];

	events.on('genii:message', async ({ text }) => {
		await Promise.resolve();
		calls.push(`first:${text}`);
	});

	events.on('genii:message', ({ text }) => {
		calls.push(`second:${text}`);
	});

	await events.emit('genii:message', { text: 'hello' });

	assert.deepEqual(calls, ['first:hello', 'second:hello']);
});

test('resolves with undefined when an event has no handlers', async () => {
	const events = createEventBus().eventsFor('example');

	assert.equal(
		await events.emit('plugin:@usegenii/example:ready', { attempt: 1 }),
		undefined,
	);
});

test('unsubscribe is explicit and idempotent', async () => {
	const events = createEventBus().eventsFor('example');
	let calls = 0;
	const unsubscribe = events.on('genii:message', () => {
		calls += 1;
	});

	unsubscribe();
	unsubscribe();
	await events.emit('genii:message', { text: 'ignored' });

	assert.equal(calls, 0);
});

test('removes every subscription owned by one plugin', async () => {
	const bus = createEventBus();
	const firstOwner = bus.eventsFor('first');
	const secondOwner = bus.eventsFor('second');
	const calls: string[] = [];

	firstOwner.on('genii:message', () => {
		calls.push('first-message');
	});

	firstOwner.on('plugin:@usegenii/example:ready', () => {
		calls.push('first-ready');
	});

	secondOwner.on('genii:message', () => {
		calls.push('second-message');
	});

	bus.removeOwner('first');
	await secondOwner.emit('genii:message', { text: 'hello' });
	await secondOwner.emit('plugin:@usegenii/example:ready', { attempt: 1 });

	assert.deepEqual(calls, ['second-message']);
});

test('rejects bare, malformed, and non-namespaced event names', async () => {
	const events = createEventBus().eventsFor('example');
	const invalidNames = [
		'message',
		'core:message',
		'genii:',
		'genii:Message',
		'plugin:example',
		'plugin:Example:ready',
		'plugin:example:ready:again',
	];

	for (const invalidName of invalidNames) {
		const name = invalidName as EventName;
		assert.throws(() => events.on(name, () => undefined), TypeError);
		await assert.rejects(events.emit(name, undefined as never), TypeError);
	}
});

test('stops after a thrown or rejected handler and preserves the error', async (t) => {
	const failure = new Error('handler failed');
	const failingHandlers = [
		[
			'throw',
			() => {
				throw failure;
			},
		],

		[
			'rejection',
			async () => {
				throw failure;
			},
		],
	] as const;

	for (const [name, failingHandler] of failingHandlers) {
		await t.test(name, async () => {
			const events = createEventBus().eventsFor('example');
			let laterHandlerRan = false;

			events.on('genii:message', failingHandler);

			events.on('genii:message', () => {
				laterHandlerRan = true;
			});

			await assert.rejects(
				events.emit('genii:message', { text: 'hello' }),
				(error) => error === failure,
			);
			assert.equal(laterHandlerRan, false);
		});
	}
});
