# Plugin runtime contract

The Gateway accepts explicit, already-configured plugin instances. This
contract does not define discovery, package loading, profile configuration, hot
reload, or process isolation.

## Public interfaces

Plugins import Genii types only. The minimum contract is:

```ts
type PluginId = string
type Cleanup = () => void | Promise<void>
type EventHandler<Payload> = (payload: Payload) => void | Promise<void>

interface GatewayEventMap {}

interface Plugin {
	readonly id: PluginId
	readonly dependencies: readonly PluginId[]
	start(context: PluginContext): ResultAsync<void, PluginLifecycleFailure>
	stop?(context: PluginContext): ResultAsync<void, PluginLifecycleFailure>
}

interface PluginContext {
	readonly pluginId: PluginId
	readonly events: PluginEvents
	readonly services: PluginServices
	defer(cleanup: Cleanup): void
}

interface PluginEvents {
	on<Name extends keyof GatewayEventMap & string>(
		name: Name,
		handler: EventHandler<GatewayEventMap[Name]>,
	): () => void
	emit<Name extends keyof GatewayEventMap & string>(
		name: Name,
		payload: GatewayEventMap[Name],
	): Promise<void>
}

declare const serviceType: unique symbol
type ServiceToken<T> = symbol & { readonly [serviceType]: (value: T) => T }
declare function serviceToken<T>(description: string): ServiceToken<T>

interface PluginServices {
	get<T>(token: ServiceToken<T>): T
	provide<T>(token: ServiceToken<T>, value: T): void
}

interface PluginLifecycleFailure {
	readonly kind: string
}
```

The host creates one owner-bound context per plugin and supplies the same
context to both hooks. A missing `stop` hook is a successful no-op. `defer`
registers an effect immediately. Effects are awaited in last-in, first-out
order. Calling `defer` after cleanup begins is a programmer error.

A plugin ID matches
`^(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*$` and cannot contain `:`.
`dependencies` lists direct plugin IDs and is explicitly empty when there are
none.

`serviceToken` returns a unique typed symbol. The context-bound `provide`
stores a value with the calling plugin as owner; callers cannot supply an owner.
The host removes those registrations after `stop` and during partial-start
rollback. Duplicate provision, an unknown required token, or use after disposal
is a programmer error. A native `Map` stores services; it is not the dependency
graph and does not control lifecycle order.

## Events

Core and plugin packages extend the exported `GatewayEventMap` through TypeScript
declaration merging. A plugin that uses a dependency's events imports that
package's declarations and lists its plugin ID in `dependencies`. This produces
one shared map of known names and payloads without a runtime definition API.

Runtime names use `genii:<name>` for core events and
`plugin:<plugin-id>:<name>` for plugin-defined events. `<name>` matches
`^[a-z0-9][a-z0-9._-]*$`; bare or malformed names are programmer errors. Core
declares the `genii:` entries, and each plugin declares entries under its own
ID. Runtime checks syntax only. Any plugin may emit or subscribe to a known
event, while the host still binds subscription ownership to its context.

`on` returns an idempotent unsubscribe function. `emit` calls handlers
sequentially in registration order and awaits each one. With no handlers it
resolves with `undefined`. An uncaught throw or rejection stops dispatch,
prevents later handlers from running, and rejects to the emitter with the same
error. It does not trigger host rollback or shutdown. Handlers must consume or
encode expected ACP, channel, and other operational failures themselves.

The host removes all owned subscriptions after a plugin's stop hook and during
rollback. Router selection remains a direct service call. Tool interception
uses a dedicated `next()` middleware chain rather than event-bus modes.

## Dependency validation and order

The host validates the entire graph before creating a context or calling a
hook. Expected `neverthrow` failures are `invalid_plugin_id { pluginId }`,
`duplicate_plugin_id { pluginId }`, `missing_plugin_dependency { pluginId,
dependencyId }`, and `plugin_dependency_cycle { pluginIds }`. Dependencies
precede dependants. If neither plugin depends transitively on the other, input
order is preserved. Cycle members appear in original input order. The resolver
is pure and does not inspect services or start plugins.

## Start, stop, and rollback

The host starts plugins in validated order and records a plugin as started only
after `start` returns `ok`. Normal shutdown visits started plugins in exact
reverse order. For each it calls `stop` when present, then always disposes its
effects and removes its services.

If `start` returns `err` or throws, the host first disposes the failing plugin's
partial effects and removes its services without calling its `stop`. It then
stops previously started plugins in reverse order. Shutdown and rollback
attempt every required hook and cleanup even after a failure.

## Failure boundary

Expected graph failures and operational failures returned by hooks use
`neverthrow`. When every failure is expected, startup returns `start_failed`
with its primary plugin failure and cleanup failures in occurrence order;
shutdown returns `stop_failed` with failures in reverse start order.

```ts
interface PluginOperationFailure {
	readonly pluginId: PluginId
	readonly phase: "start" | "stop"
	readonly failure: PluginLifecycleFailure
}

type PluginHostFailure =
	| { kind: "start_failed"; primary: PluginOperationFailure; cleanupFailures: readonly PluginOperationFailure[] }
	| { kind: "stop_failed"; failures: readonly PluginOperationFailure[] }
```

A hook or cleanup callback that throws or rejects is a programmer error. The
host finishes cleanup, then throws an `AggregateError`. Its errors contain
programmer errors in occurrence order, followed by returned
`PluginOperationFailure` records in occurrence order. Thus start `err` plus a
cleanup throw yields `[cleanupError, startFailure]`; start throw plus stop `err`
yields `[startError, stopFailure]`; multiple cleanup throws retain their order.

## Internal implementation

`hookable@6.1.1` provides awaited hooks behind the Genii event wrapper. A native
owner-tracked `Map` stores services, Node.js 24 `AsyncDisposableStack` owns each
plugin's effects, and `neverthrow` represents expected failures. Hookable and
Cordis types never appear in the public API. Cordis is reference material, not
a runtime dependency.
