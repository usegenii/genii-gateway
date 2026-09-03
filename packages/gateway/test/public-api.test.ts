import assert from 'node:assert/strict';
import test from 'node:test';

import {
	type Cleanup,
	type EventHandler,
	type GatewayEventMap,
	type Plugin,
	type PluginContext,
	type PluginEvents,
	type PluginId,
	type PluginLifecycleFailure,
	type PluginServices,
	type ServiceToken,
	serviceToken,
} from '@usegenii/gateway';

declare module '@usegenii/gateway' {
	interface GatewayEventMap {
		'plugin:consumer:ready': { readonly attempt: number };
	}
}

type PublicContract = [
	PluginId,
	Cleanup,
	EventHandler<unknown>,
	GatewayEventMap,
	Plugin,
	PluginContext,
	PluginEvents,
	ServiceToken<unknown>,
	PluginServices,
	PluginLifecycleFailure,
];

function useMergedEvent(context: PluginContext): Promise<void> {
	context.events.on('plugin:consumer:ready', ({ attempt }) => {
		assert.equal(typeof attempt, 'number');
	});

	return context.events.emit('plugin:consumer:ready', { attempt: 1 });
}

test('exports the plugin-author contract from the built package root', () => {
	const contract: PublicContract | undefined = undefined;
	const first = serviceToken<string>('shared');
	const second = serviceToken<string>('shared');

	assert.equal(contract, undefined);
	assert.equal(typeof useMergedEvent, 'function');
	assert.notEqual(first, second);
});

test('does not export internal construction helpers', async () => {
	const gateway = await import('@usegenii/gateway');

	assert.deepEqual(Object.keys(gateway), ['serviceToken']);
});
