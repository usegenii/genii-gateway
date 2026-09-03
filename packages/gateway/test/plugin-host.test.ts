import assert from 'node:assert/strict';
import test from 'node:test';
import { errAsync, okAsync, ResultAsync } from 'neverthrow';

import { createEventBus } from '../src/event-bus.ts';
import type { Plugin } from '../src/index.ts';
import { createPluginHost } from '../src/plugin-host.ts';
import { createServiceRegistry } from '../src/plugin-services.ts';

const hostFor = (plugins: readonly Plugin[]) =>
	createPluginHost(plugins, createEventBus(), createServiceRegistry());

const validHostFor = (plugins: readonly Plugin[]) => {
	const host = hostFor(plugins);
	assert.equal(host.isOk(), true);
	if (host.isErr()) {
		throw new Error('Expected a valid plugin graph');
	}

	return host.value;
};

const rejectsWithErrors = async (
	operation: () => Promise<unknown>,
	expected: readonly unknown[],
) => {
	await assert.rejects(operation, (error: unknown) => {
		assert.ok(error instanceof AggregateError);
		assert.deepEqual(error.errors, expected);
		return true;
	});
};

test('starts dependencies first and stops in reverse order with the same context', async () => {
	const calls: string[] = [];

	const plugins = (['base', 'app'] as const).map((id, index) => ({
		id,
		dependencies: index ? ['base'] : [],
		start(context: Parameters<Plugin['start']>[0]) {
			calls.push(`start:${id}`);
			assert.equal(context.pluginId, id);
			return okAsync(undefined);
		},

		stop(context: Parameters<NonNullable<Plugin['stop']>>[0]) {
			calls.push(`stop:${id}`);
			assert.equal(context.pluginId, id);
			return okAsync(undefined);
		},
	}));

	const host = hostFor(plugins);
	assert.equal(host.isOk(), true);
	if (host.isErr()) {
		return;
	}

	assert.equal((await host.value.start()).isOk(), true);
	assert.equal((await host.value.stop()).isOk(), true);
	assert.deepEqual(calls, [
		'start:base',
		'start:app',
		'stop:app',
		'stop:base',
	]);
});

test('rolls back a failed start and reports expected stop failures', async () => {
	const calls: string[] = [];

	const plugins: Plugin[] = [
		{
			id: 'first',
			dependencies: [],
			start: () => {
				calls.push('start:first');
				return okAsync(undefined);
			},

			stop: () => {
				calls.push('stop:first');
				return errAsync({ kind: 'stop-error' });
			},
		},
		{
			id: 'second',
			dependencies: ['first'],
			start: () => {
				calls.push('start:second');
				return okAsync(undefined);
			},

			stop: () => {
				calls.push('stop:second');
				return okAsync(undefined);
			},
		},
		{
			id: 'broken',
			dependencies: ['second'],
			start: () => {
				calls.push('start:broken');
				return errAsync({ kind: 'start-error' });
			},
		},
	];

	const host = hostFor(plugins);
	assert.equal(host.isOk(), true);
	if (host.isErr()) {
		return;
	}

	const result = await host.value.start();
	assert.equal(result.isErr(), true);
	if (result.isOk()) {
		return;
	}

	assert.deepEqual(result.error, {
		kind: 'start_failed',
		primary: {
			pluginId: 'broken',
			phase: 'start',
			failure: { kind: 'start-error' },
		},
		cleanupFailures: [
			{
				pluginId: 'first',
				phase: 'stop',
				failure: { kind: 'stop-error' },
			},
		],
	});
	assert.deepEqual(calls, [
		'start:first',
		'start:second',
		'start:broken',
		'stop:second',
		'stop:first',
	]);
});

test('aggregates cleanup throws before an expected start failure', async () => {
	const calls: string[] = [];
	const firstError = new Error('first cleanup failed');
	const secondError = new Error('second cleanup failed');
	const failure = { kind: 'start-error' };

	const host = validHostFor([
		{
			id: 'broken',
			dependencies: [],
			start(context) {
				context.defer(() => {
					calls.push('first');
					throw firstError;
				});

				context.defer(() => {
					calls.push('second');
					throw secondError;
				});

				return errAsync(failure);
			},
		},
	]);

	await rejectsWithErrors(
		async () => await host.start(),
		[
			secondError,
			firstError,
			{ pluginId: 'broken', phase: 'start', failure },
		],
	);
	assert.deepEqual(calls, ['second', 'first']);
});

test('aggregates a start throw before an expected rollback failure', async () => {
	const startError = new Error('start failed');
	const failure = { kind: 'stop-error' };

	const host = validHostFor([
		{
			id: 'started',
			dependencies: [],
			start: () => okAsync(undefined),
			stop: () => errAsync(failure),
		},
		{
			id: 'broken',
			dependencies: ['started'],
			start: () => {
				throw startError;
			},
		},
	]);

	await rejectsWithErrors(
		async () => await host.start(),
		[startError, { pluginId: 'started', phase: 'stop', failure }],
	);
});

test('returns expected shutdown failures in reverse start order', async () => {
	const host = validHostFor(
		['first', 'second'].map((id) => ({
			id,
			dependencies: [],
			start: () => okAsync(undefined),
			stop: () => errAsync({ kind: `${id}-stop-error` }),
		})),
	);
	assert.equal((await host.start()).isOk(), true);

	const result = await host.stop();
	assert.equal(result.isErr(), true);
	if (result.isOk()) {
		return;
	}

	assert.deepEqual(result.error, {
		kind: 'stop_failed',
		failures: ['second', 'first'].map((id) => ({
			pluginId: id,
			phase: 'stop',
			failure: { kind: `${id}-stop-error` },
		})),
	});
});

test('finishes mixed shutdown cleanup before aggregating failures', async () => {
	const calls: string[] = [];
	const cleanupError = new Error('cleanup failed');
	const stopError = new Error('stop rejected');
	const failure = { kind: 'expected-stop-error' };

	const host = validHostFor([
		{
			id: 'first',
			dependencies: [],
			start(context) {
				context.defer(() => {
					calls.push('cleanup:first');
				});

				return okAsync(undefined);
			},

			stop: () => {
				calls.push('stop:first');
				return ResultAsync.fromSafePromise(Promise.reject(stopError));
			},
		},
		{
			id: 'second',
			dependencies: ['first'],
			start(context) {
				context.defer(async () => {
					calls.push('cleanup:second');
					throw cleanupError;
				});

				return okAsync(undefined);
			},

			stop: () => {
				calls.push('stop:second');
				return errAsync(failure);
			},
		},
	]);
	assert.equal((await host.start()).isOk(), true);

	await rejectsWithErrors(
		async () => await host.stop(),
		[
			cleanupError,
			stopError,
			{ pluginId: 'second', phase: 'stop', failure },
		],
	);
	assert.deepEqual(calls, [
		'stop:second',
		'cleanup:second',
		'stop:first',
		'cleanup:first',
	]);
});
