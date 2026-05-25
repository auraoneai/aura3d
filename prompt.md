You are continuing Verity180.

This is the final revenue loop prompt.

Do not create another “Phase 21 / Phase 22 / Phase 23” sequence.

Do not stop after one blocker.
Do not stop after one submission.
Do not stop after one pending report.
Do not stop after writing another artifact.
Do not stop after proving one internal system works.

Your job is to keep working the revenue loop until one of the explicit terminal outcomes is reached:

1. REVENUE_FOUND
2. SUBMISSIONS_DONE_WAITING
3. KILL

You must not return to the user until one of those terminal outcomes is true.

============================================================
MISSION
============================================================

Turn Verity180 into a revenue-generating system, or prove with hard evidence that the current strategy cannot generate revenue.

Revenue evidence means one of:

- reward_pending = true from a real platform response;
- paid = true from real payment evidence;
- confirmed_earned_payout > 0 from verified payment evidence.

Everything else is not revenue.

Not revenue:

- target candidates;
- discovered candidates;
- internal packets;
- dry-runs;
- submitted expected payout;
- passing tests;
- dashboards;
- “would_submit=true”;
- report drafts;
- local repros;
- local evidence tasks;
- open PRs;
- watch-only status.

============================================================
CURRENT TRUTH
============================================================

Current Verity platform has:

- Evidence Maturity Engine.
- Route verification.
- Submission approval.
- Auto-submit policy framework.
- Submission execution engine.
- Dedicated submission execution persistence table.
- Submission transport registry.
- Google Bug Hunters browser/session backend wired.
- Huntr browser/session backend wired.
- Playwright and Chromium working in production.
- Paid target acquisition.
- Paid opportunity swarm.
- Ops Console transport/autonomy/swarm/targets pages.

Current packets:

1. Skops

- packet_id = skops-update-autotrust
- platform = Huntr
- submitted = true
- watch-only = true
- reward_pending = false
- paid = false
- confirmed_earned_payout_delta = 0
- must not be resubmitted.

2. Gemini

- packet_id = google-gemini-cli-a2a-env-pretrust
- platform = Google Bug Hunters / Google Cloud VRP
- state = SUBMISSION_READY
- route verified = true
- approval persisted = auto_approved_by_policy
- submitted = false
- dry-run passed
- dedicated dry-run persistence passed
- execute was attempted
- execute blocked at Google UI state:
  - google_bug_hunters_ui_unexpected_path
  - google_bug_hunters_account_not_visible
- reward_pending = false
- paid = false
- confirmed_earned_payout_delta = 0

Current revenue truth:

- confirmed_earned_payout = 0
- reward_pending = false
- paid = false
- external submissions = 1
- only Skops has been submitted externally so far.

Current lesson:

The control plane is now good enough. Do not build more platform unless it directly removes the active revenue blocker encountered in this loop.

============================================================
TERMINAL OUTCOMES
============================================================

You may return only when one of these is true:

------------------------------------------------------------
A. REVENUE_FOUND
------------------------------------------------------------

At least one real external submission or PR has produced:

- reward_pending = true, or
- paid = true, or
- confirmed_earned_payout > 0.

You must record:

- platform evidence;
- URL/reference;
- amount if known;
- state transition;
- payment/reward proof;
- updated ledger.

------------------------------------------------------------
B. SUBMISSIONS_DONE_WAITING
------------------------------------------------------------

At least 5 real external submissions were made through authorized routes.

For each submission:

- receipt captured;
- watch tracker created;
- no reward/payment yet;
- follow-up plan recorded;
- all are waiting on platform/maintainer response.

A single submitted report is not terminal.
A single pending report is not terminal.
Two, three, or four pending reports are not terminal.
Stop only after 5 real external submissions are pending/watching, unless revenue appears earlier.

------------------------------------------------------------
C. KILL
------------------------------------------------------------

Kill only if all of these are true:

- at least 20 credible targets were reviewed;
- at least 3 distinct platform routes were assessed or attempted:
  - Huntr;
  - Google Bug Hunters;
  - GitHub PR or HackerOne/Bugcrowd/manual route;
- no viable submission-ready packet can be created;
- or no authorized submission route can be used;
- or all viable targets are duplicates, out of scope, no-payout, or require prohibited hosted probing;
- and no revenue or reward-pending evidence exists.

Kill report must be written to:

ops/revenue/revenue-loop/revenue-loop-kill-report-YYYYMMDD.json

============================================================
ABSOLUTE RULES
============================================================

Do not return early.

Do not stop after one blocker if another route, target, platform, or manual submission path remains.

Do not keep adding dashboards.

Do not add more framework unless it directly removes the current revenue blocker.

Do not add more adapters unless the target/source is proven to have a real payout route.

Do not submit Skops again.

Do not submit weak reports.

Do not submit duplicate reports.

Do not submit any report that is not in scope.

Do not test hosted targets.

Do not probe live services.

Do not exploit live systems.

Do not access third-party private data.

Do not create PRs/issues/comments unless the selected route is an authorized bounty or OSS contribution route and all gates pass.

Do not send follow-ups unless the platform/maintainer response requires it and the follow-up is recorded.

Do not mark reward_pending without platform evidence.

Do not mark paid without payment evidence.

Do not increase confirmed_earned_payout above 0 without payment evidence.

Do not bypass captcha.

Do not accept unknown terms automatically.

Do not use blind coordinate clicks.

Do not submit if account/form/page/route/hash validation fails.

Do not print secrets, cookies, tokens, browser state, session files, or .env values.

Do not commit secrets, browser state, cookies, tokens, session files, or .env files.

Do not commit prompt.md.

Keep prompt.md untracked.

Do not touch unrelated files.

Do not fix unrelated lint debt.

============================================================
CORE LOOP
============================================================

You must keep cycling this loop until a terminal outcome is reached:

1. Check current production state.
2. Check existing watch items for response/reward/payment.
3. Choose the best available revenue route.
4. If a mature packet exists, try to submit it through the safest valid route.
5. If the route blocks, fix only the blocker if code/config-fixable.
6. If the route is externally blocked, switch route or target.
7. Review the next credible target.
8. Build evidence packet only if real local evidence exists.
9. Run maturity/readiness.
10. Submit if all gates pass.
11. Capture receipt.
12. Create watch tracker.
13. Immediately continue to the next target/submission.
14. Stop only at REVENUE_FOUND, SUBMISSIONS_DONE_WAITING, or KILL.

The loop is:

target
-> local/source review
-> local repro if possible
-> duplicate check
-> evidence packet
-> maturity audit
-> route selection
-> dry-run
-> submit
-> receipt
-> watch
-> next target

Do not wait after one submission. Continue until the 5-submission quota, revenue evidence, or kill criteria is reached.

============================================================
CENTRAL LEDGER
============================================================

Create or update the central loop ledger:

ops/revenue/revenue-loop/current-revenue-loop.json

Schema:

{
  "started_at": "",
  "updated_at": "",
  "terminal_status": "running | revenue_found | submissions_done_waiting | killed",
  "confirmed_earned_payout": 0,
  "reward_pending": false,
  "paid": false,
  "external_submissions": [],
  "submission_attempts": [],
  "manual_submission_packets": [],
  "active_blockers": [],
  "fixed_blockers": [],
  "current_best_route": "",
  "current_best_target": "",
  "targets_reviewed": [],
  "packets_created": [],
  "watch_items": [],
  "routes_assessed": [],
  "kill_criteria": {},
  "secrets_printed": false
}

Every blocker must include:

{
  "blocker": "",
  "classification": "code_fixable | config_fixable | account_session_fixable | platform_manual_only | target_not_viable | duplicate | no_payout_route | external_wait_required | kill_condition",
  "route": "",
  "packet_id": "",
  "target": "",
  "fixed": false,
  "next_action": ""
}

Do not write vague blockers.

============================================================
STEP 1 — HARD PREFLIGHT
============================================================

Run:

git status --short --branch

Expected:

- main == origin/main
- only untracked prompt.md

Read:

- pivot.md
- ops/revenue/revenue-loop/current-revenue-loop.json if it exists
- ops/revenue/phase-0/2026-05-24-manual-revenue-sprint/google-gemini-controlled-submit-blocker-20260525.json
- ops/revenue/phase-0/2026-05-24-manual-revenue-sprint/submission-execution-table-fix-20260525.json
- ops/revenue/phase-0/2026-05-24-manual-revenue-sprint/platform-session-backend-wiring-20260525.json
- ops/revenue/phase-0/2026-05-24-manual-revenue-sprint/skops-response-payment-tracker.json
- ops/revenue/phase-0/2026-05-24-manual-revenue-sprint/huntr-submission-receipt-skops-update-autotrust.json

Check production APIs:

GET /healthz
GET /ops/evidence-maturity
GET /ops/submission-transport-registry
GET /ops/auto-submit-policies
GET /ops/submission-execution/google-gemini-cli-a2a-env-pretrust/eligibility
GET /ops/submission-execution/skops-update-autotrust/eligibility

Record:

- API release
- enabled policies
- transport readiness
- Gemini state
- Skops state
- revenue truth

Do not mutate in preflight.

============================================================
STEP 2 — CHECK EXISTING WATCH ITEMS FIRST
============================================================

Before generating new work, check existing submitted items:

1. Skops / Huntr

- report URL: https://huntr.com/bounties/e156bd82-6d77-48dc-bd7b-afdf66fe2514
- do read-only status check only if available through current tracker/API/browser session.
- do not send follow-up.
- do not edit report.
- update tracker only if status changed.

2. Any other watch trackers under:

ops/revenue/revenue-loop/watch/
ops/revenue/phase-0/2026-05-24-manual-revenue-sprint/*tracker*.json

If reward/payment evidence appears:

- update ledger;
- set terminal_status = revenue_found;
- stop with REVENUE_FOUND.

If no response/reward/payment:

- continue.

============================================================
STEP 3 — ONE FINAL GOOGLE UI BOUNDARY ATTEMPT
============================================================

Gemini has already passed the deepest gates. Try exactly one focused Google UI-boundary fix and submission attempt.

Current Gemini blocker:

- google_bug_hunters_ui_unexpected_path
- google_bug_hunters_account_not_visible

Allowed inspection:

Use reviewed Playwright backend only.

Open only:

https://bughunters.google.com/report/

Capture sanitized UI state only:

- URL
- host
- path
- title
- account chooser visible true/false
- login required true/false
- account email visible true/false
- account match true/false/null
- captcha visible true/false
- terms gate visible true/false
- report form visible true/false
- Cloud VRP option visible true/false
- unknown required fields list
- unexpected route details
- screenshot only if it contains no secrets; redact if needed

Do not print cookies, storage state, tokens, or session contents.

Create artifact:

ops/revenue/revenue-loop/google-bughunters-ui-state-YYYYMMDD.json

If issue is route/selector handling and can be safely fixed, fix it.

If account is logged in but email is not visible, allow validation to pass only if:

- storage state exists;
- page is authenticated;
- no account chooser;
- no login prompt;
- no captcha;
- report form is visible;
- expected route/product fields exist.

If page requires login, account chooser, captcha, unknown terms, or unknown required fields:

- classify as account_session_fixable or platform_manual_only;
- record exact blocker;
- do not keep working Google automation;
- switch to manual Gemini packet or another route.

If fixed:

- enable exact Gemini policy only;
- enable Google submit flags only;
- verify can_submit=true;
- dry-run;
- execute;
- capture receipt or blocker;
- lock down.

If submitted:

- create receipt;
- create watch tracker;
- add to external_submissions;
- continue to next target unless reward_pending/paid appears immediately.

If still blocked:

- create manual submission packet for Gemini;
- then switch route/target.

============================================================
STEP 4 — MANUAL SUBMISSION PACKET FOR GEMINI IF AUTOMATION FAILS
============================================================

If Gemini remains blocked only by Google UI automation but the packet is submission-ready, create a manual submission packet.

Path:

ops/revenue/revenue-loop/manual-submission-packets/google-gemini-cli-a2a-env-pretrust-manual-submit.md

It must include:

- exact report title;
- exact report body;
- Google Bug Hunters route URL;
- Cloud VRP / Google Bug Hunters route instructions;
- target repository;
- affected commit;
- source permalinks;
- local repro evidence;
- report hash;
- no-hosted-testing statement;
- AI assistance disclosure;
- exact copy/paste fields;
- receipt fields to capture;
- watch tracker to update after submission.

If manual submission is actually performed, record receipt and count it as one external submission.

If manual submission is not performed, do not keep blocking the loop on Gemini. Move on to Huntr/other targets.

============================================================
STEP 5 — ROUTE SELECTION
============================================================

Assess all routes.

Write:

ops/revenue/revenue-loop/route-decision-YYYYMMDD.json

For each route:

- platform
- can submit automatically today?
- can submit manually today?
- credentials/session configured?
- route verified?
- policy available?
- candidate packet available?
- expected payout route?
- blockers
- next action

Routes to assess:

1. Huntr
2. Google Bug Hunters
3. GitHub PR
4. HackerOne
5. Bugcrowd
6. Gitpay
7. Opire
8. Email/manual disclosure route

Ranking rule:

Prefer the route that can produce legitimate external submissions fastest.

Default likely ranking:

1. Huntr, if session/backend works or manual route works.
2. Google Bug Hunters, if Gemini can be submitted manually or automation is fixed.
3. GitHub PR, only if real payout and low competition.
4. HackerOne/Bugcrowd, only if public scope and session allow report.
5. Manual route, if official disclosure route exists.

Do not obsess over one route if another can submit.

============================================================
STEP 6 — TARGET REVIEW QUOTA
============================================================

Review at least 20 credible targets unless terminal outcome occurs earlier.

Target pool:

Huntr-compatible AI/ML OSS:

- langflow-ai/langflow
- open-webui/open-webui
- mlflow/mlflow
- gradio-app/gradio
- ray-project/ray
- huggingface/transformers
- vllm-project/vllm
- ComfyUI/ComfyUI
- run-llama/llama_index
- lm-sys/FastChat
- infiniflow/ragflow

Google/OSS VRP:

- google-gemini/gemini-cli
- google/osv-scanner
- google/gvisor
- Google OSS-Fuzz related projects with clear local-only analysis

Other credible routes:

- GitHub PR bounty only with real payout and low competition.
- HackerOne/Bugcrowd only with authorized public scope.
- Email/manual route only with official security policy.

For each target:

1. Verify bounty/disclosure route.
2. Verify scope.
3. Verify local/source-only analysis feasibility.
4. Check duplicates:
   - public CVEs;
   - existing issues;
   - existing advisories;
   - existing PRs;
   - prior submitted reports in Verity.
5. Run local source review.
6. Run bounded local repro only if safe.
7. If real finding exists, create evidence packet.
8. If duplicate/not viable, record and move to next target.

Target review artifact:

ops/revenue/revenue-loop/target-reviews/<target-slug>-review-YYYYMMDD.json

Fields:

{
  "target": "",
  "platform": "",
  "route_url": "",
  "scope_verified": true/false,
  "payout_route": "",
  "local_analysis_feasible": true/false,
  "duplicates_checked": true/false,
  "duplicate_found": true/false,
  "finding_found": true/false,
  "packet_created": true/false,
  "submission_attempted": true/false,
  "submitted": true/false,
  "reason": "",
  "next_action": ""
}

============================================================
STEP 7 — PACKET CREATION RULES
============================================================

Create an evidence packet only if a real finding exists.

Packet folder:

ops/revenue/revenue-loop/evidence-packets/<target-slug>-<finding-slug>/

Required files:

- report.md
- local-repro.py or equivalent
- local-repro-result.json
- duplicate-search.json
- route-verification.json
- approval-packet.json
- submission-readiness.json

Required report contents:

- title
- target
- platform
- affected repo
- affected commit
- affected files/functions
- vulnerability type
- impact
- preconditions
- local reproduction
- expected vs actual behavior
- suggested fix
- duplicate search
- limitations
- no-hosted-testing statement
- AI assistance disclosure

Packet must set:

- external_action_allowed=false until route/policy/manual standing rules apply;
- submitted=false;
- reward_pending=false;
- paid=false;
- confirmed_earned_payout_delta=0.

Run maturity/readiness.

Submit only if SUBMISSION_READY.

============================================================
STEP 8 — SUBMISSION RULES
============================================================

A packet may be submitted only if:

- SUBMISSION_READY;
- route verified;
- local proof exists;
- duplicate search done;
- report body complete;
- no overclaiming;
- no hosted testing;
- dry-run passes if automated;
- receipt capture available if automated;
- manual receipt capture checklist exists if manual.

Standing approval in this prompt:

You are authorized to submit reports that satisfy all of these:

- official/public authorized bounty or disclosure route;
- local/source-only proof;
- no hosted probing;
- no live exploitation;
- no third-party private data;
- no secrets/tokens disclosed;
- no overclaiming RCE/account compromise/payment;
- exact report body generated from reviewed artifacts;
- route is official program route;
- packet is non-duplicate and non-submitted.

If the platform requires UI and automation fails, prepare manual submission packet and keep moving. Do not stall the loop.

============================================================
STEP 9 — AFTER EVERY SUBMISSION
============================================================

After each successful external submission:

1. Capture receipt.
2. Create watch tracker.
3. Update current-revenue-loop.json.
4. Lock down flags if automation was used.
5. Immediately continue to next target/submission.
6. Do not stop unless revenue evidence appears or 5 submissions are now waiting.

Watch tracker path:

ops/revenue/revenue-loop/watch/<packet-id>-watch.json

Schema:

{
  "packet_id": "",
  "platform": "",
  "submission_url": "",
  "external_reference": "",
  "submitted_at": "",
  "triage_state": "submitted_or_pending",
  "response_received": false,
  "reward_pending": false,
  "paid": false,
  "confirmed_earned_payout": 0,
  "last_checked_at": "",
  "next_check_at": "",
  "follow_up_sent": false
}

============================================================
STEP 10 — FIVE-SUBMISSION QUOTA
============================================================

Do not stop after one submission.

Continue until:

- reward_pending=true, or
- paid=true, or
- confirmed_earned_payout > 0, or
- 5 real external submissions have receipts and are waiting, or
- 20 targets have been reviewed and no more viable submissions exist.

A submitted-but-pending report is work-in-progress, not terminal.

============================================================
STEP 11 — VALIDATION
============================================================

For code changes:

python -m py_compile touched Python files

uv run ruff check --select F touched Python/test files

PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 uv run pytest -q relevant tests

For artifacts:

python -m json.tool on all new/modified JSON artifacts

python scripts/evidence_maturity_audit.py --dir ops/revenue/phase-0/2026-05-24-manual-revenue-sprint --json

git diff --check

Do not run unrelated full-repo lint cleanup.

============================================================
STEP 12 — COMMIT / PUSH CADENCE
============================================================

Commit after meaningful completed units:

- UI boundary fix
- submission receipt
- manual submission packet
- target review batch
- revenue loop ledger update
- kill report

Commit messages must be outcome-based:

- Record Gemini submission receipt
- Record Gemini manual submission packet
- Record revenue loop target reviews
- Record revenue loop submission receipts
- Kill revenue loop after failed target quota

Push to origin/main.

prompt.md remains untracked.

============================================================
FINAL REPORT
============================================================

Return only when terminal outcome is reached:

REVENUE_FOUND
or
SUBMISSIONS_DONE_WAITING
or
KILL

Report format:

1. Terminal status
2. Revenue truth
3. Submissions made
4. Receipts
5. Watch states
6. Rewards/payments if any
7. Gemini outcome
8. Skops outcome
9. Targets reviewed
10. Packets created
11. Code changes, if any
12. Validation
13. Git commit/push
14. Exact next external wait/action

Do not end with “next phase.”
Do not propose another architecture prompt.