import type { ResultAsync } from 'neverthrow';

export type PluginId = string;
export type Cleanup = () => void | Promise<void>;
export type EventHandler<Payload> = (payload: Payload) => void | Promise<void>;

// biome-ignore lint/suspicious/noEmptyInterface: Event packages extend this map through declaration merging.
export interface GatewayEventMap {}

type EventName = keyof GatewayEventMap & string;

export interface PluginEvents {
	on<Name extends EventName>(
		name: Name,
		handler: EventHandler<GatewayEventMap[Name]>,
	): () => void;
	emit<Name extends EventName>(
		name: Name,
		payload: GatewayEventMap[Name],
	): Promise<void>;
}

declare const serviceType: unique symbol;

export type ServiceToken<T> = symbol & {
	readonly [serviceType]: (value: T) => T;
};

export function serviceToken<T>(description: string): ServiceToken<T> {
	return Symbol(description) as ServiceToken<T>;
}

export interface PluginServices {
	get<T>(token: ServiceToken<T>): T;
	provide<T>(token: ServiceToken<T>, value: T): void;
}

export interface PluginContext {
	readonly pluginId: PluginId;
	readonly events: PluginEvents;
	readonly services: PluginServices;
	defer(cleanup: Cleanup): void;
}

export interface PluginLifecycleFailure {
	readonly kind: string;
}

export interface Plugin {
	readonly id: PluginId;
	readonly dependencies: readonly PluginId[];
	start(context: PluginContext): ResultAsync<void, PluginLifecycleFailure>;
	stop?(context: PluginContext): ResultAsync<void, PluginLifecycleFailure>;
}
