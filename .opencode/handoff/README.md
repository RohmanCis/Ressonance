# Handoff Harness

This directory contains the active task state only:

```text
.opencode/handoff/
├── README.md
├── CURRENT.md
├── task.md
└── result.md
```

- `CURRENT.md` — active task only; updated by the orchestrator before and after every task.
- `task.md` — current task contract; written before delegation and read by the implementing agent.
- `result.md` — current task result; written by the implementing agent at completion and read by the orchestrator before completion is recorded.

`result.md` must include: status, files changed, validation, blockers, SSOT conflict, architecture drift, and next step.

## Authority

Agents, QA, and reviewers may use only this repository's canonical documents (`docs/`) and `AGENTS.md` as authority. External projects, workspaces, absolute paths outside the repository, imported external requirements, and external AGENTS files are invalid authority and must never be used to change, challenge, or QA this repository's behavior.

Do not create per-task files, task/result directories, or duplicate canonical-document content. Canonical documents remain the source of truth.
