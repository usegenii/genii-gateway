import type { GatewayEventBus, PluginEvents, PluginId } from './event-bus.ts';
import type {
	GatewayServiceRegistry,
	PluginServices,
	ServiceToken,
} from './plugin-services.ts';

export type Cleanup = () => void | Promise<void>;

export interface PluginContext {
	readonly pluginId: PluginId;
	readonly events: PluginEvents;
	readonly services: PluginServices;
	defer(cleanup: Cleanup): void;
}

export interface OwnedPluginContext {
	readonly context: PluginContext;
	dispose(): Promise<void>;
}

export function createPluginContext(
	pluginId: PluginId,
	eventBus: GatewayEventBus,
	serviceRegistry: GatewayServiceRegistry,
): OwnedPluginContext {
	const owner = { active: true };
	const effects = new AsyncDisposableStack();
	const ownedEvents = eventBus.eventsFor(pluginId);
	const ownedServices = serviceRegistry.servicesFor(pluginId);
	let disposal: Promise<void> | undefined;

	const assertActive = () => {
		if (!owner.active) {
			throw new Error(`Plugin context for "${pluginId}" is disposed`);
		}
	};

	const context: PluginContext = {
		pluginId,
		events: {
			on(name, handler) {
				assertActive();
				return ownedEvents.on(name, handler);
			},
			async emit(name, payload) {
				assertActive();
				await ownedEvents.emit(name, payload);
			},
		},
		services: {
			get<T>(token: ServiceToken<T>): T {
				assertActive();
				return ownedServices.get(token);
			},
			provide<T>(token: ServiceToken<T>, value: T): void {
				assertActive();
				ownedServices.provide(token, value);
			},
		},
		defer(cleanup) {
			assertActive();
			effects.defer(cleanup);
		},
	};

	return {
		context,
		dispose() {
			if (disposal) {
				return disposal;
			}

			owner.active = false;
			disposal = Promise.resolve().then(async () => {
				try {
					await effects.disposeAsync();
				} finally {
					try {
						eventBus.removeOwner(pluginId);
					} finally {
						serviceRegistry.removeOwner(pluginId);
					}
				}
			});
			return disposal;
		},
	};
}
