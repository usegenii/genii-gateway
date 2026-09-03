import { err, ok, type Result } from 'neverthrow';
import type { PluginId } from './index.ts';

export interface PluginDescriptor {
	readonly id: PluginId;
	readonly dependencies: readonly PluginId[];
}

export type PluginDependencyFailure =
	| { readonly kind: 'invalid_plugin_id'; readonly pluginId: PluginId }
	| { readonly kind: 'duplicate_plugin_id'; readonly pluginId: PluginId }
	| {
			readonly kind: 'missing_plugin_dependency';
			readonly pluginId: PluginId;
			readonly dependencyId: PluginId;
	  }
	| {
			readonly kind: 'plugin_dependency_cycle';
			readonly pluginIds: readonly PluginId[];
	  };

const pluginIdPattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

export function resolvePluginOrder(
	plugins: readonly PluginDescriptor[],
): Result<readonly PluginDescriptor[], PluginDependencyFailure> {
	const pluginsById = new Map<PluginId, PluginDescriptor>();

	for (const plugin of plugins) {
		if (!pluginIdPattern.test(plugin.id)) {
			return err({ kind: 'invalid_plugin_id', pluginId: plugin.id });
		}

		if (pluginsById.has(plugin.id)) {
			return err({ kind: 'duplicate_plugin_id', pluginId: plugin.id });
		}

		pluginsById.set(plugin.id, plugin);
	}

	for (const plugin of plugins) {
		for (const dependencyId of plugin.dependencies) {
			if (!pluginIdPattern.test(dependencyId)) {
				return err({
					kind: 'invalid_plugin_id',
					pluginId: dependencyId,
				});
			}

			if (!pluginsById.has(dependencyId)) {
				return err({
					kind: 'missing_plugin_dependency',
					pluginId: plugin.id,
					dependencyId,
				});
			}
		}
	}

	const ordered: PluginDescriptor[] = [];
	const resolved = new Set<PluginId>();

	while (ordered.length < plugins.length) {
		const next = plugins.find(
			(plugin) =>
				!resolved.has(plugin.id) &&
				plugin.dependencies.every((dependencyId) =>
					resolved.has(dependencyId),
				),
		);

		if (!next) {
			const unresolved = new Set(
				plugins
					.filter((plugin) => !resolved.has(plugin.id))
					.map((plugin) => plugin.id),
			);
			return err({
				kind: 'plugin_dependency_cycle',
				pluginIds: findCycleMembers(plugins, pluginsById, unresolved),
			});
		}

		ordered.push(next);
		resolved.add(next.id);
	}

	return ok(ordered);
}

function findCycleMembers(
	plugins: readonly PluginDescriptor[],
	pluginsById: ReadonlyMap<PluginId, PluginDescriptor>,
	unresolved: ReadonlySet<PluginId>,
): readonly PluginId[] {
	function reachesStart(
		start: PluginId,
		current: PluginId,
		visited: Set<PluginId>,
	): boolean {
		const plugin = pluginsById.get(current);
		if (!plugin) {
			return false;
		}

		for (const dependencyId of plugin.dependencies) {
			if (!unresolved.has(dependencyId)) {
				continue;
			}

			if (dependencyId === start) {
				return true;
			}

			if (visited.has(dependencyId)) {
				continue;
			}

			visited.add(dependencyId);
			if (reachesStart(start, dependencyId, visited)) {
				return true;
			}
		}

		return false;
	}

	return plugins
		.filter(
			(plugin) =>
				unresolved.has(plugin.id) &&
				reachesStart(plugin.id, plugin.id, new Set([plugin.id])),
		)
		.map((plugin) => plugin.id);
}
