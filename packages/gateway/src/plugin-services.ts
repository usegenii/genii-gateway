declare const serviceType: unique symbol;

export type ServiceToken<T> = symbol & {
	readonly [serviceType]: (value: T) => T;
};

export interface PluginServices {
	get<T>(token: ServiceToken<T>): T;
	provide<T>(token: ServiceToken<T>, value: T): void;
}

export interface GatewayServiceRegistry {
	servicesFor(pluginId: string): PluginServices;
	removeOwner(pluginId: string): void;
}

interface Owner {
	disposed: boolean;
}

interface Registration {
	readonly owner: Owner;
	readonly value: unknown;
}

export function serviceToken<T>(description: string): ServiceToken<T> {
	return Symbol(description) as ServiceToken<T>;
}

export function createServiceRegistry(): GatewayServiceRegistry {
	const registrations = new Map<symbol, Registration>();
	const owners = new Map<
		string,
		{ readonly owner: Owner; readonly services: PluginServices }
	>();

	return {
		servicesFor(pluginId) {
			const existing = owners.get(pluginId);
			if (existing) {
				return existing.services;
			}

			const owner: Owner = { disposed: false };
			const assertActive = () => {
				if (owner.disposed) {
					throw new Error(
						`Plugin services for "${pluginId}" are disposed`,
					);
				}
			};
			const services: PluginServices = {
				get<T>(token: ServiceToken<T>): T {
					assertActive();
					const registration = registrations.get(token);
					if (!registration) {
						throw new Error(
							`Unknown service token: ${String(token)}`,
						);
					}

					return registration.value as T;
				},
				provide<T>(token: ServiceToken<T>, value: T): void {
					assertActive();
					if (registrations.has(token)) {
						throw new Error(
							`Service token already provided: ${String(token)}`,
						);
					}

					registrations.set(token, { owner, value });
				},
			};

			owners.set(pluginId, { owner, services });
			return services;
		},
		removeOwner(pluginId) {
			const owned = owners.get(pluginId);
			if (!owned) {
				return;
			}

			owned.owner.disposed = true;
			owners.delete(pluginId);

			for (const [token, registration] of registrations) {
				if (registration.owner === owned.owner) {
					registrations.delete(token);
				}
			}
		},
	};
}
