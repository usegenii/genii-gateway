---
name: write-gateway-prose
description: Apply Genii Gateway prose conventions to documentation, architecture text, code comments, test names, issues, pull requests, and commit messages. Use whenever Codex drafts, edits, or reviews durable prose for this repository.
---

# Write Gateway prose

## Ground the text

- Identify the artifact and its job before writing.
- Keep project overview and setup in `README.md`. Keep ownership, data flow, and system contracts in `docs/architecture.md`.
- Use issues for scoped future work. Use pull requests for the actual change and completed validation.
- Read the canonical nearby text and preserve its established terms.

## State the current behavior or contract

- Describe current behavior or an accepted contract in present tense.
- Distinguish an implemented behavior from an architecture contract or proposal. Do not imply implementation evidence that does not exist.
- Omit bug history, migration stories, release archaeology, and how the project reached a decision unless the user asks for that history.
- Name the actor and action. Prefer "The router chooses the ACP session" to "The session is selected."
- State ownership and boundaries directly when they matter.

## Use Gateway terms consistently

- Write "Genii Gateway" on first reference and "the Gateway" afterward.
- Expand "Agent Client Protocol" before using "ACP" when the audience or document has not already defined it.
- Use channel, router, plugin, profile, session, and harness for their documented concepts. Do not rotate synonyms for variety.
- Keep common component names lowercase unless they start a sentence or name a package or product.

## Keep the prose plain

- Use active voice, concrete nouns and verbs, and one main point per paragraph.
- Use sentence-case headings and lists only when the items are easier to scan than prose.
- Keep Mermaid diagrams only when they clarify ownership, sequence, or data flow better than a paragraph.
- Update the canonical explanation and link to it instead of copying the same explanation into another file.
- Remove promotional language, vague claims, throat-clearing, forced summaries, and generic conclusions.

## Match the artifact

- Write comments only for non-obvious reasons, invariants, or constraints. Do not narrate the code.
- Make test names state observable behavior in present tense.
- Give an issue one concrete research or implementation task, with scope, non-goals, acceptance criteria, validation, and real dependencies. Stop before the next task requires guessing.
- Describe a pull request with the actual change, its reason, and completed validation. Do not claim CI, runtime, or compatibility checks that did not run.
- Use a concise imperative subject for commits and name the behavior or artifact that changes.
