---
name: write-gateway-code
description: Apply Genii Gateway implementation conventions to TypeScript source, tests, package configuration, refactors, architecture decisions, and code review. Use whenever Codex writes, changes, designs, or reviews code in this repository.
---

# Write Gateway code

## Establish the contract

- Read the nearest source, tests, tracked configuration, and relevant architecture section before editing.
- Treat source and tracked configuration as implementation truth. Treat `docs/architecture.md` as the accepted system contract. Call out conflicts before changing either one.
- Identify the behavior, owner, trust boundary, and expected failures before choosing an implementation.
- Stop at the ambiguity horizon. Implement an agreed seam or ask for the missing decision instead of encoding a guess about future behavior.

## Keep the implementation small

- Choose the smallest complete solution after tracing the affected flow and callers.
- Reuse repository code, Node.js APIs, and existing dependencies before adding code or packages.
- Add a dependency only when it reduces more code or risk than it introduces.
- Avoid speculative extension points, single-implementation interfaces, factories for one product, and configuration for values that do not vary.
- Keep modules cohesive and explicit. Do not create aggregation-only barrel files.
- Add compatibility paths, caches, retries, and other operational machinery only for a current requirement.

## Preserve ownership

- Keep session records, orchestration, context, tools, plugin lifecycle, and profile data in Gateway core.
- Keep session selection, participant authorization, queue or interruption policy, and destination checks in routers.
- Keep native event translation and approved channel operations in channel plugins.
- Keep model execution, transcripts, history selection, compaction, and harness-internal state in ACP harnesses.
- Put a rule at the narrowest shared owner instead of repeating it across callers.

## Use the TypeScript contract

- Keep native ESM, NodeNext resolution, and the repository's strict compiler settings.
- Model domain states with types. Do not use `any`, unchecked assertions, or non-null assertions to hide an unresolved contract.
- Validate data at trust boundaries, then rely on typed values internally.
- Return expected operational failures with `neverthrow`. Throw only for broken invariants or programmer errors.
- Keep dependency versions exact and let pnpm update the lockfile.

## Test and validate behavior

- Use `node:test` and `node:assert/strict` without another test framework.
- Test observable contracts introduced by the change. Do not add a ceremonial import or smoke test when no behavior exists.
- Mock only a real external boundary. Prefer small inputs over fixtures and helper layers.
- Let Biome own mechanical formatting.
- Run the narrowest relevant check while iterating. Run `pnpm check` before handoff when dependencies are available.
- When planning implementation issues, target roughly 200 changed TypeScript lines including tests. Split by coherent behavior, not by an arbitrary count.
