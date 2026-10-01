# Jev PR gate

Dependabot PRs are validated first, then the trusted default-branch workflow asks Jev to route the PR before any automatic merge.

Routing:

- `AUTO_MERGE`: the existing SHA-pinned squash merge path may continue.
- `CODEX_REVIEW`: keep the PR open for a deeper automated code review.
- `HUMAN_REVIEW`: keep the PR open for manual inspection.

The gate is fail-closed. Missing credentials, API failures, unexpected files, stale PR SHAs, invalid Jev responses, or insufficient probability margin never auto-merge a PR.

## Required secret

Create an Actions secret named `AI_GATEWAY_API_KEY` containing a Vercel AI Gateway API key. The Jev call runs from the `workflow_run` workflow on the trusted default branch, so the secret is not exposed to Dependabot PR code.

## Optional repository variables

- `JEV_MODEL` (default: `typesafe-ai/jev`)
- `JEV_MIN_CONFIDENCE` (default: `0.40`)
- `JEV_MIN_AUTO_PROBABILITY` (default: `0.60`)
- `JEV_MIN_AUTO_MARGIN` (default: `0.20`)

Tune thresholds against observed PRs before making them less conservative.
