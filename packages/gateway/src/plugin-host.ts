import { err, ok, type Result, ResultAsync } from 'neverthrow';
import type { GatewayEventBus } from './event-bus.ts';
import type { PluginContext } from './plugin-context.ts';
import {
	createPluginContext,
	type OwnedPluginContext,
} from './plugin-context.ts';
import {
	type PluginDependencyFailure,
	type PluginDescriptor,
	type PluginId,
	resolvePluginOrder,
} from './plugin-dependencies.ts';
import type { GatewayServiceRegistry } from './plugin-services.ts';

export interface PluginLifecycleFailure {
	readonly kind: string;
}

export interface Plugin extends PluginDescriptor {
	start(context: PluginContext): ResultAsync<void, PluginLifecycleFailure>;
	stop?(context: PluginContext): ResultAsync<void, PluginLifecycleFailure>;
}

export interface PluginOperationFailure {
	readonly pluginId: PluginId;
	readonly phase: 'start' | 'stop';
	readonly failure: PluginLifecycleFailure;
}

export type PluginHostFailure =
	| {
			readonly kind: 'start_failed';
			readonly primary: PluginOperationFailure;
			readonly cleanupFailures: readonly PluginOperationFailure[];
	  }
	| {
			readonly kind: 'stop_failed';
			readonly failures: readonly PluginOperationFailure[];
	  };

export interface PluginHost {
	start(): ResultAsync<void, PluginHostFailure>;
	stop(): ResultAsync<void, PluginHostFailure>;
}

export function createPluginHost(
	plugins: readonly Plugin[],
	eventBus: GatewayEventBus,
	serviceRegistry: GatewayServiceRegistry,
): Result<PluginHost, PluginDependencyFailure> {
	const ordered = resolvePluginOrder(plugins);
	if (ordered.isErr()) {
		return err(ordered.error);
	}
	const pluginsById = new Map(plugins.map((plugin) => [plugin.id, plugin]));
	const orderedPlugins = ordered.value.map((plugin) => {
		const resolved = pluginsById.get(plugin.id);
		if (!resolved) {
			throw new Error(`Missing plugin: ${plugin.id}`);
		}

		return resolved;
	});

	const contexts = new Map<PluginId, OwnedPluginContext>();
	const started: Plugin[] = [];
	let startPromise: ResultAsync<void, PluginHostFailure> | undefined;
	let stopPromise: ResultAsync<void, PluginHostFailure> | undefined;

	const start = () => {
		if (startPromise) {
			return startPromise;
		}

		startPromise = ResultAsync.fromPromise(
			(async () => {
				for (const plugin of orderedPlugins) {
					const owned = createPluginContext(
						plugin.id,
						eventBus,
						serviceRegistry,
					);
					contexts.set(plugin.id, owned);
					const result = await plugin.start(owned.context);
					if (result.isErr()) {
						await owned.dispose();
						const cleanupFailures: PluginOperationFailure[] = [];
						await stopPlugins(started, cleanupFailures);
						throw new ExpectedHostFailure({
							kind: 'start_failed',
							primary: {
								pluginId: plugin.id,
								phase: 'start',
								failure: result.error,
							},
							cleanupFailures,
						});
					}
					started.push(plugin);
				}
			})(),
			(error) =>
				(error instanceof ExpectedHostFailure
					? error.failure
					: error) as PluginHostFailure,
		);
		return startPromise;
	};

	const stop = () => {
		if (stopPromise) {
			return stopPromise;
		}

		stopPromise = ResultAsync.fromPromise(
			(async () => {
				const failures: PluginOperationFailure[] = [];
				await stopPlugins(started, failures);
				if (failures.length) {
					throw new ExpectedHostFailure({
						kind: 'stop_failed',
						failures,
					});
				}
			})(),
			(error) =>
				(error instanceof ExpectedHostFailure
					? error.failure
					: error) as PluginHostFailure,
		);
		return stopPromise;
	};

	async function stopPlugins(
		list: readonly Plugin[],
		failures: PluginOperationFailure[],
	) {
		for (const plugin of [...list].reverse()) {
			const owned = contexts.get(plugin.id);
			if (!owned) {
				continue;
			}

			if (plugin.stop) {
				const result = await plugin.stop(owned.context);
				if (result.isErr()) {
					failures.push({
						pluginId: plugin.id,
						phase: 'stop',
						failure: result.error,
					});
				}
			}
			await owned.dispose();
		}
		for (const plugin of list) {
			contexts.delete(plugin.id);
		}
	}

	return ok({ start, stop });
}

class ExpectedHostFailure extends Error {
	readonly failure: PluginHostFailure;

	constructor(failure: PluginHostFailure) {
		super(failure.kind);
		this.failure = failure;
	}
}
