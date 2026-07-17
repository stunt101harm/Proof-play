# ADR 0003: Versioned canonical condition contract

- Status: Accepted
- Date: 2026-07-17
- Owners: ProofPlay team

## Context

ProofPlay must show users plain-language conditions while settling from exact TxLINE statistic keys and positional validation strategies. If UI copy, compiler output, keeper input, and on-chain state can diverge, the product reintroduces the trust problem it is meant to solve.

An unbounded expression language would be difficult to validate, audit, render, and fit into Solana transactions.

## Decision

Use a bounded, versioned canonical condition document:

- Version 1 supports one or two condition blocks joined only by `all` (`AND`).
- Version 1 requests no more than four unique TxLINE stat keys.
- Supported blocks are participant winner, total goals bound, both teams score, winning margin, and total corners bound.
- Integer bounds are canonical. Half-line sportsbook copy is display-only sugar.
- Team identity is stored as fixture participant position, not mutable display text.
- Legs are normalized and sorted with a versioned comparator.
- RFC 8785 canonical JSON is hashed with SHA-256.
- The 32-byte commitment and compiler version are stored with the pool.
- Human copy, stat-key requests, strategy, local preview, and receipt are all derived from the canonical document.
- Unsupported or ambiguous conditions are rejected rather than approximated.

## Consequences

### Positive

- Identical logical conditions have stable commitments.
- Users can inspect the exact settlement contract.
- Compiler behavior can be unit-tested exhaustively.
- Program upgrades can retain old semantics by compiler version.
- The transaction stays bounded.

### Negative

- The initial market catalog is intentionally small.
- New condition types require a versioned compiler and coordinated UI/program support.
- Canonicalization must be implemented consistently across runtimes.

## Alternatives rejected

- **Store only human text:** not deterministic or safe for settlement.
- **Store only compiled bytes:** difficult for users and receipts to audit.
- **Arbitrary expression AST:** too broad for the deadline and on-chain constraints.
- **Hash non-canonical JSON:** equivalent conditions could produce different commitments.

## Revisit when

- TxLINE exposes additional proven stats needed by users.
- Multi-fixture or `OR` markets have a concrete, bounded validation design.
- A new compiler version can be deployed without changing existing pool semantics.
