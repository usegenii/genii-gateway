---
name: advance-ambiguity-frontier
description: Audit the latest default branch, repository documentation and source, GitHub issues and native dependencies, open pull requests, and existing Codex threads to find the next unambiguous work frontier. Use when asked to advance or reassess the ambiguity horizon, create the next tree of concrete research or implementation issues, verify blocked and blocking relationships, or launch all unblocked ready issues as parallel Codex worktree threads that implement to reviewed pull requests.
---

# Advance the ambiguity frontier

Find the next work the repository has already decided it needs. Create only
issues whose remaining choices are implementation details, then start every
ready issue in an isolated Codex thread.

## Guardrails

- Treat the latest fetched default branch and live GitHub state as authoritative.
- Preserve dirty checkouts. Fetch and inspect `origin/main`; do not overwrite
  user changes to update a local branch.
- Separate "unblocked" from "ready." A broad epic with no native blocker is
  not ready when its product or runtime does not exist yet.
- Stop at the first missing product, contract, or architecture decision. That
  point is the ambiguity horizon.
- Create a research issue at the horizon only when the exact question,
  deliverable, and downstream consumer are already clear. Do not create a
  research issue merely to choose what the project should build next.
- Target at most roughly 200 changed code and test lines per implementation
  issue. Smaller is fine. Split likely larger work with dependencies.
- Put tests for new behavior in its implementation issue. Do not create a
  "missing test" issue for behavior that does not exist.
- Do not duplicate an open issue, pull request, branch, or active Codex thread.
- Create GitHub issues or Codex threads only when the user authorized those
  mutations. A request to audit or report does not authorize them.
- Never merge implementation pull requests unless the user separately asks.

## Bootstrap without serializing discovery

Keep the parent preflight small:

1. Fetch the default branch and record its commit SHA.
2. Confirm the repository identity, default branch, and whether the user
   authorized issue and thread mutations.
3. Enumerate the available subagent slots and Codex hosts. Do not read every
   document, source file, issue, pull request, or thread before delegation.

Delegate those expensive reads immediately. Require every subagent to recheck
the small piece of live state it will mutate immediately before doing so.

## Start discovery and ready work together

Use subagents for actual parallelism. Do not finish frontier research before
auditing and starting current ready work.

Maintain two queues: frontier discovery and ready-work launch. While both have
work, reserve at least one child slot for each. Combine frontier questions or
use waves before starving the launch queue. With three child slots, prefer a
contract subagent, a source subagent, and a ready-work coordinator. With two,
combine contract and source in one frontier subagent. If only one child slot is
available, state that true parallelism is unavailable and use waves.

Start these lanes concurrently:

### Frontier lane

Assign read-only subagents with non-overlapping questions. When capacity is
tight, combine adjacent questions in one subagent.

- Contract lane: identify decisions settled by current documentation and the
  first decisions the documents leave open.
- Source lane: map implemented behavior to the contracts, identify concrete
  gaps, and estimate whether each candidate fits the size target.

Each subagent returns evidence, proposed issues before the horizon, rejected
candidates with reasons, and uncertainties. These subagents do not create
issues or edit the repository.

### Current-ready launch lane

At the same time, assign a ready-work coordinator to read all open issues and
their bodies, native dependencies, open pull requests and changed files,
branches, and existing Codex threads. It classifies every open issue as ready,
blocked, claimed, closed by live work, or ambiguous. An issue is ready only
when every native blocker is closed, its scope is concrete, and no pull request
or Codex thread claims it. The coordinator also returns duplicate candidates,
incorrect dependency edges, and overlap evidence for frontier synthesis.

As soon as the coordinator returns, create a parent-owned assignment ledger
keyed by `owner/repo#number`. Give each ready issue to exactly one launch
subagent. Run launch subagents concurrently with any frontier subagents still
working, in waves when needed. Each launch subagent:

1. Rechecks the issue state, open native blockers, claiming remote branches,
   open pull requests, and existing Codex threads.
2. Stops without mutation if the issue became blocked, closed, ambiguous, or
   claimed.
3. Lists Codex projects, creates one new worktree thread for the issue, embeds
   the stable issue key and URL in its title or prompt, and reads it back to
   confirm it is active.
4. Returns the issue URL, thread ID, host ID, worktree path, and launch status.

The launch subagent only creates and verifies the Codex thread. It does not
implement the issue in its own checkout.

## Reconcile the frontier

Wait for the discovery lanes and initial launch lanes at one barrier. Record
each launch assignment as `created`, `already_claimed`, `not_ready`, or
`failed`. The parent agent owns synthesis and GitHub issue mutations.

Before creating issues, cross a mutation barrier:

1. Fetch the default branch again and compare its SHA with the bootstrap SHA.
2. Refresh open issues, native dependencies, pull requests, branches, and
   Codex threads, including threads created by the initial launch lane.
3. If the SHA changed, inspect the intervening diff and revalidate every
   affected candidate. Send changed questions back to a frontier subagent when
   needed.
4. Wait for every changed-SHA revalidation assignment to reach a terminal
   result before evaluating or creating candidates.
5. Reject candidates newly covered, blocked, claimed, or made ambiguous by the
   refresh.

For every candidate:

1. Verify its premise against the fetched default branch and live GitHub state.
2. Reject it if another issue, pull request, branch, or Codex thread covers it,
   its acceptance criteria require an undecided behavior, or it crosses the
   ambiguity horizon.
3. Split implementation work until each issue has one concrete result and the
   size target is credible.
4. Order research and implementation issues into a dependency tree.

Write implementation issues with:

- One observable result.
- Exact scope and explicit non-goals.
- Acceptance criteria tied to current contracts.
- Focused and repository-wide validation.
- A target of at most roughly 200 changed code and test lines.
- Dependencies and the work this issue blocks.

Write research issues with:

- The exact questions to settle.
- A named documentation deliverable.
- Choices the issue must make rather than defer.
- Explicit non-goals.
- Acceptance criteria proving downstream implementation no longer needs a
  product or contract decision.
- Dependencies and downstream consumers.

Create approved issues in dependency order so their numeric IDs are available.
Use GitHub's native issue dependency API, not only prose or task-list links.
Compare the intended and live dependency graphs as sets. Add missing edges.
When the request authorizes correcting dependencies and the evidence proves an
edge wrong, remove it; otherwise report it for confirmation. For every intended
edge `B blocks A`, verify that A's `blocked_by` response contains B and B's
`blocking` response contains A. Closed blockers may remain recorded; readiness
depends on whether any recorded blocker is still open.

## Launch newly ready work in parallel

Refresh issues, native dependencies, pull requests, and Codex threads after
creating the issue tree. Compute the ready set again and subtract every issue
already launched by the initial ready-work lane.

Add remaining ready issues to the assignment ledger, then assign one launch
subagent per issue and run them concurrently. Use the same duplicate checks and
readback as the initial launch lane.

If a thread-creation call times out, search recent threads across hosts and Git
worktrees for the exact stable issue key and URL before retrying. Treat an
unknown outcome as claimed until live reconciliation disproves it. Retry at
most once after confirming that no matching thread or worktree exists; then
report an infrastructure blocker. If waiting for a launch subagent times out,
inspect that agent's status and live thread state instead of spawning a
replacement. Replace only a terminally failed subagent after reconciliation.
Allow at most one replacement per ledger assignment. If the replacement also
fails, mark the assignment `failed` and report the infrastructure blocker.

Give every implementation thread this contract:

- Start in a new worktree from the latest default branch.
- Fetch `origin/main` and inspect the live issue, native dependencies, claiming
  remote branches, open pull requests, existing Codex threads, current
  contracts, and relevant source before editing.
- Exclude the current thread and worktree from claim checks. Stop if the issue
  is closed, blocked, ambiguous, or claimed by another branch, pull request, or
  Codex thread.
- Implement only the issue and honor its sizing target and non-goals.
- Run focused validation and the full required repository checks.
- Spawn an independent review subagent. Resolve every actionable finding and
  repeat review when needed until clean.
- Fetch the latest default branch again and reconcile safely.
- Commit, push, and open a pull request that closes the issue.
- Do not merge.
- Verify the live pull request head and base, mergeability, and terminal hosted
  CI success before reporting completion.

Research threads follow the same publication and review flow, but produce the
issue's documentation deliverable instead of runtime code.

## Final readback

Before reporting:

1. Wait until every launch ledger entry is terminal: `created`,
   `already_claimed`, `not_ready`, or `failed`.
2. Refresh the default-branch SHA, open issues, native dependency graph, open
   pull requests, and Codex threads once more.
3. Confirm every created issue body and every dependency edge by readback.
4. Confirm each ready issue has exactly one active implementation thread or a
   documented reason it was not launched.
5. Report whether the ambiguity horizon moved, which issues were created, the
   verified dependency tree, threads launched, ready issues excluded, and any
   infrastructure blocker.
6. Include the app's created-thread directives for every successfully created
   thread when the thread tool requires them.

Parallelism is part of completion. If only one subagent slot is available,
state that constraint and use waves. Do not describe sequential work as
parallel.
