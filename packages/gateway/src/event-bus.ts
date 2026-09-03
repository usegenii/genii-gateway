import { createHooks } from 'hookable';
import type {
	EventHandler,
	GatewayEventMap,
	PluginEvents,
	PluginId,
} from './index.ts';

type EventName = keyof GatewayEventMap & string;
type GatewayHooks = {
	[Name in EventName]: EventHandler<GatewayEventMap[Name]>;
};

interface TypedHooks {
	hook<Name extends EventName>(
		name: Name,
		handler: EventHandler<GatewayEventMap[Name]>,
	): () => void;
	callHook<Name extends EventName>(
		name: Name,
		payload: GatewayEventMap[Name],
	): Promise<unknown> | undefined;
}

export interface GatewayEventBus {
	eventsFor(pluginId: PluginId): PluginEvents;
	removeOwner(pluginId: PluginId): void;
}

const eventNamePattern =
	/^(?:genii:[a-z0-9][a-z0-9._-]*|plugin:(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9._-]*)$/;

function assertEventName(name: string): void {
	if (!eventNamePattern.test(name)) {
		throw new TypeError(`Invalid Gateway event name: ${name}`);
	}
}

export function createEventBus(): GatewayEventBus {
	const hooks = createHooks<GatewayHooks>() as TypedHooks;
	const subscriptions = new Map<PluginId, Set<() => void>>();

	return {
		eventsFor(pluginId) {
			return {
				on(name, handler) {
					assertEventName(name);

					const removeHook = hooks.hook(name, handler);
					const owned =
						subscriptions.get(pluginId) ?? new Set<() => void>();
					subscriptions.set(pluginId, owned);

					const unsubscribe = () => {
						if (!owned.delete(unsubscribe)) {
							return;
						}

						removeHook();

						if (owned.size === 0) {
							subscriptions.delete(pluginId);
						}
					};

					owned.add(unsubscribe);
					return unsubscribe;
				},
				async emit(name, payload) {
					assertEventName(name);
					await hooks.callHook(name, payload);
				},
			};
		},
		removeOwner(pluginId) {
			for (const unsubscribe of subscriptions.get(pluginId) ?? []) {
				unsubscribe();
			}
		},
	};
}
