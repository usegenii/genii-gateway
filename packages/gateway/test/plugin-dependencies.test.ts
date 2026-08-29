import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	type PluginDependencyFailure,
	type PluginDescriptor,
	type PluginId,
	resolvePluginOrder,
} from '../src/index.ts';

const plugin = (
	id: PluginId,
	dependencies: readonly PluginId[] = [],
): PluginDescriptor => ({
	id,
	dependencies,
});

function orderedIds(plugins: readonly PluginDescriptor[]): readonly PluginId[] {
	const result = resolvePluginOrder(plugins);
	assert(result.isOk());
	return result.value.map(({ id }) => id);
}

function failureFor(
	plugins: readonly PluginDescriptor[],
): PluginDependencyFailure {
	const result = resolvePluginOrder(plugins);
	assert(result.isErr());
	return result.error;
}

test('orders empty and single-plugin graphs', () => {
	assert.deepEqual(orderedIds([]), []);
	assert.deepEqual(orderedIds([plugin('@genii/router')]), ['@genii/router']);
});

test('orders dependency chains before their dependants', () => {
	assert.deepEqual(
		orderedIds([
			plugin('application', ['router']),
			plugin('router', ['channel']),
			plugin('channel'),
		]),
		['channel', 'router', 'application'],
	);
});

test('orders a diamond while retaining sibling input order', () => {
	assert.deepEqual(
		orderedIds([
			plugin('application', ['left', 'right']),
			plugin('left', ['base']),
			plugin('right', ['base']),
			plugin('base'),
		]),
		['base', 'left', 'right', 'application'],
	);
});

test('retains input order for unrelated plugins', () => {
	assert.deepEqual(
		orderedIds([plugin('third'), plugin('first'), plugin('second')]),
		['third', 'first', 'second'],
	);
});

test('rejects invalid plugin IDs', () => {
	assert.deepEqual(failureFor([plugin('INVALID')]), {
		kind: 'invalid_plugin_id',
		pluginId: 'INVALID',
	});
	assert.deepEqual(failureFor([plugin('consumer', ['bad:id'])]), {
		kind: 'invalid_plugin_id',
		pluginId: 'bad:id',
	});
});

test('rejects duplicate plugin IDs', () => {
	assert.deepEqual(failureFor([plugin('router'), plugin('router')]), {
		kind: 'duplicate_plugin_id',
		pluginId: 'router',
	});
});

test('rejects missing dependencies', () => {
	assert.deepEqual(failureFor([plugin('router', ['channel'])]), {
		kind: 'missing_plugin_dependency',
		pluginId: 'router',
		dependencyId: 'channel',
	});
});

test('reports only cycle members in their original input order', () => {
	assert.deepEqual(
		failureFor([
			plugin('consumer', ['cycle-a']),
			plugin('cycle-a', ['cycle-b']),
			plugin('unrelated'),
			plugin('cycle-b', ['cycle-a']),
		]),
		{
			kind: 'plugin_dependency_cycle',
			pluginIds: ['cycle-a', 'cycle-b'],
		},
	);
});

test('reports a self-dependency as a cycle', () => {
	assert.deepEqual(failureFor([plugin('recursive', ['recursive'])]), {
		kind: 'plugin_dependency_cycle',
		pluginIds: ['recursive'],
	});
});
