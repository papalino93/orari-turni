---
name: ask-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree, then produce an updated plan incorporating every decision. Invoke explicitly with /ask-me to stress-test a plan, validate an architecture or spec, or work through open questions in a proposal before committing to it.
user-invocable: true
disable-model-invocation: true
argument-hint: "[plan or topic to interview about — omit to use the plan already on the table]"
version: 0.1.0
tagline: "Interviews your plan before you commit — one question at a time."
summary: >
  Puts your plan through a **rigorous interview** before you commit to it.
  **One question at a time**, dependencies resolved in order, **a
  recommended answer always offered first** — and shaky answers get pushed
  back on once before moving on. When every branch is settled, you get the
  plan back rewritten with **the decisions baked in**, not a transcript to
  reread.
examples:
  - command: "/ask-me"
    description: "Interviews you about the plan currently on the table, one question at a time, until every branch of the decision tree is resolved, then rewrites the plan with the decisions baked in."
---

# Ask Me

Interview the user about their plan until every branch of the decision tree is resolved, then deliver an updated plan.

## Questions

- Ask every question via the AskUserQuestion tool, one question per call — later questions often depend on the previous answer.
- Put your recommended answer first, labeled "(Recommended)". Make options concrete and mutually exclusive, with the trade-off in each description. For open-ended questions, offer your best candidates; "Other" covers the rest.
- Never ask what you can verify yourself by exploring the codebase or files.

## Decision tree

- Keep a running list of open branches and resolved decisions. Resolve dependencies first (architecture before naming); answers may open new branches — follow them all.
- Play devil's advocate: hunt for unstated assumptions, failure modes, edge cases. Push back once with the strongest counterargument on shaky answers.
- No filler and no re-asking settled questions. Stop when you could implement the plan without guessing on anything material.

## Deliverable

Rewrite the original plan as a markdown file (or update the plan file in place), integrating decisions into the body — no Q&A transcript. Append a "Decisions" section (choice + one-line rationale) and an open-questions section for anything deferred. Present the file when done.
