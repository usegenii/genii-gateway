import assert from 'node:assert/strict';
import test from 'node:test';
import { errAsync, okAsync } from 'neverthrow';

import { createEventBus } from '../src/event-bus.ts';
import { createPluginHost, type Plugin } from '../src/plugin-host.ts';
import { createServiceRegistry } from '../src/plugin-services.ts';

const hostFor = (plugins: readonly Plugin[]) =>
	createPluginHost(plugins, createEventBus(), createServiceRegistry());

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
	if (host.isErr()) return;
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
	if (host.isErr()) return;
	const result = await host.value.start();
	assert.equal(result.isErr(), true);
	if (result.isOk()) return;
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
