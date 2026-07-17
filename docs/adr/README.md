# Architecture decision records

| ADR                                          | Decision                                                                                        | Status   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| [0001](0001-hackathon-architecture.md)       | Use a TypeScript web workspace, Anchor program, server-side TxLINE adapter, and separate keeper | Accepted |
| [0002](0002-binary-parimutuel-pools.md)      | Use binary zero-fee pari-mutuel pools instead of an AMM or order book                           | Accepted |
| [0003](0003-versioned-condition-contract.md) | Use a bounded, versioned canonical condition contract                                           | Accepted |

ADRs record cross-cutting decisions. A later decision that reverses one of these should add a new ADR and mark the earlier record superseded rather than silently editing history.
