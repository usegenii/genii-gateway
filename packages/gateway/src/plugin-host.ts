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

		startPromise = new ResultAsync(
			(async (): Promise<Result<void, PluginHostFailure>> => {
				for (const plugin of orderedPlugins) {
					const owned = createPluginContext(
						plugin.id,
						eventBus,
						serviceRegistry,
					);
					contexts.set(plugin.id, owned);
					let result: Result<void, PluginLifecycleFailure>;
					try {
						result = await plugin.start(owned.context);
					} catch (error) {
						const programmerErrors = [error];
						const cleanupFailures: PluginOperationFailure[] = [];
						await disposePlugin(plugin.id, owned, programmerErrors);
						await stopPlugins(
							started,
							programmerErrors,
							cleanupFailures,
						);
						throw new AggregateError(
							[...programmerErrors, ...cleanupFailures],
							'Plugin startup failed',
						);
					}
					if (result.isErr()) {
						const programmerErrors: unknown[] = [];
						const primary: PluginOperationFailure = {
							pluginId: plugin.id,
							phase: 'start',
							failure: result.error,
						};
						const cleanupFailures: PluginOperationFailure[] = [];
						await disposePlugin(plugin.id, owned, programmerErrors);
						await stopPlugins(
							started,
							programmerErrors,
							cleanupFailures,
						);
						if (programmerErrors.length) {
							throw new AggregateError(
								[
									...programmerErrors,
									primary,
									...cleanupFailures,
								],
								'Plugin startup failed',
							);
						}
						return err({
							kind: 'start_failed',
							primary,
							cleanupFailures,
						});
					}
					started.push(plugin);
				}
				return ok(undefined);
			})(),
		);
		return startPromise;
	};

	const stop = () => {
		if (stopPromise) {
			return stopPromise;
		}

		stopPromise = new ResultAsync(
			(async (): Promise<Result<void, PluginHostFailure>> => {
				const programmerErrors: unknown[] = [];
				const failures: PluginOperationFailure[] = [];
				await stopPlugins(started, programmerErrors, failures);
				if (programmerErrors.length) {
					throw new AggregateError(
						[...programmerErrors, ...failures],
						'Plugin shutdown failed',
					);
				}
				if (failures.length) {
					return err({
						kind: 'stop_failed',
						failures,
					});
				}
				return ok(undefined);
			})(),
		);
		return stopPromise;
	};

	async function stopPlugins(
		list: readonly Plugin[],
		programmerErrors: unknown[],
		failures: PluginOperationFailure[],
	) {
		for (const plugin of [...list].reverse()) {
			const owned = contexts.get(plugin.id);
			if (!owned) {
				continue;
			}

			if (plugin.stop) {
				try {
					const result = await plugin.stop(owned.context);
					if (result.isErr()) {
						failures.push({
							pluginId: plugin.id,
							phase: 'stop',
							failure: result.error,
						});
					}
				} catch (error) {
					programmerErrors.push(error);
				}
			}
			await disposePlugin(plugin.id, owned, programmerErrors);
		}
	}

	async function disposePlugin(
		pluginId: PluginId,
		owned: OwnedPluginContext,
		programmerErrors: unknown[],
	) {
		try {
			await owned.dispose();
		} catch (error) {
			appendProgrammerErrors(error, programmerErrors);
		} finally {
			contexts.delete(pluginId);
		}
	}

	return ok({ start, stop });
}

function appendProgrammerErrors(error: unknown, errors: unknown[]) {
	if (error instanceof SuppressedError) {
		appendProgrammerErrors(error.suppressed, errors);
		appendProgrammerErrors(error.error, errors);
	} else {
		errors.push(error);
	}
}
