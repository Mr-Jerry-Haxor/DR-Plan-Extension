# DR Plan Review and Automation

Cross-browser WebExtension for reviewing ERPS Disaster Recovery plans against
the 32 checkpoints in `research data/checklist.txt` and preparing post-approval Test and
Exercise Summary records.

## Browser packages

One source tree generates two Manifest V3 packages:

- `dist/chromium` — Chrome 116+ and Chromium-based Microsoft Edge.
- `dist/firefox` — Firefox 142+, using Firefox's event-page and sidebar keys.

Run:

```powershell
npm test
npm run verify:har
npm run build
npm run check
npm run package
```

Load `dist/chromium` through Chrome or Edge's **Load unpacked** action. Clicking
the toolbar icon opens the persistent side panel by default. Load
`dist/firefox` as a temporary add-on from `about:debugging`; Firefox opens the
sidebar at install and the toolbar icon toggles it afterward. There is no
toolbar popup in either browser package.

`npm run package` creates all exported packages directly under `dist/`:

- `dist/dr-plan-review-chromium-<version>.zip`
- `dist/dr-plan-review-firefox-<version>.zip`
- `dist/dr-plan-review-firefox-<version>-unsigned.xpi`

The unsigned XPI is suitable for validation and Firefox Developer Edition,
Nightly, or controlled enterprise environments where signature enforcement is
disabled. Release and Beta Firefox require a Mozilla-signed XPI. Configure
`WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET`, then run `npm run sign:firefox` to
submit an unlisted build to AMO and download the signed XPI. Credentials are
read from the environment and are never stored in the repository.

## Workflow

1. Sign in to ERPS in the same browser profile.
2. Select **DR Plugin** from the ERPS left sidebar. The complete extension UI
   replaces the ERPS main content workspace instead of opening the browser side
   pane. This always opens the all-plan dashboard, regardless of which plan was
   previously open.
3. Open an ERPS IT Plan. When the plan is Approved and required post-approval
   records or header dates are missing, ERPS displays **Complete Post-DR
   Process** beside ERPS Reports, Update, and Save controls. Selecting it keeps
   the plan open and presents a modal for choosing only the pending post-DR
   actions.
4. Alternatively, open the extension from the toolbar and select **Check
   session**.
5. Search or refresh the DR Plan list, select one plan, then choose
   **Load and validate**.
6. Review PASS, FAIL, REVIEW, and N/A findings. REVIEW means that the HAR-backed
   ERPS evidence is insufficient, commonly because historical GSEP or ESATS
   evidence is required.
7. In **Post-approval automation**, review the records suggested by recovery
   level. Required records are preselected; optional records are not.
8. Confirm the exact records. The extension synchronizes the corresponding
   Orientation, Tabletop, or Drill date fields on the parent IT
   Plan, then creates the selected Test and Exercise Summary records.
9. The extension never updates ERPS as a side effect of running validation.
   Writes begin only after the confirmation dialog.

The post-approval date defaults to the ERPS Plan Approval Date. Every create is
checked against the recovery-level matrix, and an existing record with the same
application, validation type, and date is skipped. This makes a retry safe after
a partial network failure: already confirmed records are not recreated.

The embedded dashboard gets the ERPS total count first, retrieves every
accessible DR Plan through sequential server-side pages, and then presents the
results in 100-plan UI pages. Search, status, organization, and approval-date
filters work locally without discarding selections. Multiple filtered plans can
be selected and validated together. Each plan shows its ERPS status and the
most recently captured plugin workflow initiator.

When an ESATS tab is already signed in, validation reads the token transiently
from that tab's local or session storage and requests the ESATS contact-summary
endpoint for each application. The DR extension does not copy the bearer token
into extension storage. ESATS evidence is used for Organization, Business Unit,
Application Manager, and live application-status checks; unavailable or
historical evidence remains REVIEW.

## Safety and data handling

The extension uses the existing ERPS browser session with
`credentials: "include"`. It does not request cookie access, read authorization
headers, execute code in the ERPS page's main JavaScript world, or persist full
plan data. A narrowly scoped isolated content script adds only the conditional
Post-DR action, the permanent DR Plugin sidebar entry, and the embedded main
workspace. The latest sanitized validation result, UI preferences, and a
bounded local audit of the ERPS-verified workflow initiator are stored locally.
The workflow history is stored in IndexedDB table `erps_dr_plugin_table` and
contains only plan ID, action type, initiator, completion time, and result
counts. It excludes email, phone, authorization, bearer-token, and cookie data.
Creation requests are not automatically retried, preventing duplicate records
after an ambiguous network failure.

## Modular checkpoint architecture

- `checkpoints/ERPS1.js` through `checkpoints/ERPS32.js` own individual
  checkpoint rules.
- `checkpoints/shared.js` contains deterministic normalization and evidence
  helpers.
- `checkpoints/index.js` is the ordered checkpoint registry.
- `core/validation.js` only orchestrates modules and calculates the result
  summary.

## Verification boundary

Unit tests, HAR contract checks, generated-manifest checks, and static package
checks are local evidence only. Live ERPS writes and historical ESATS/GSEP
checks require an authorized signed-in Boeing browser profile.
