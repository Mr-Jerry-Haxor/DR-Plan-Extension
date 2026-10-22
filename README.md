# DR Plan Review and Automation

Cross-browser WebExtension for reviewing ERPS Disaster Recovery plans against
the 32 checkpoints in `checklist.txt` and preparing post-approval Test and
Exercise Summary records.

## Browser packages

One source tree generates two Manifest V3 packages:

- `dist/chromium` — Chrome 114+ and Chromium-based Microsoft Edge.
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

`npm run package` creates:

- `artifacts/dr-plan-review-chromium-<version>.zip`
- `artifacts/dr-plan-review-firefox-<version>.zip`
- `artifacts/dr-plan-review-firefox-<version>-unsigned.xpi`

The unsigned XPI is suitable for validation and Firefox Developer Edition,
Nightly, or controlled enterprise environments where signature enforcement is
disabled. Release and Beta Firefox require a Mozilla-signed XPI. Configure
`WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET`, then run `npm run sign:firefox` to
submit an unlisted build to AMO and download the signed XPI. Credentials are
read from the environment and are never stored in the repository.

## Workflow

1. Sign in to ERPS in the same browser profile.
2. Open the extension and select **Check session**.
3. Search or refresh the DR Plan list, select one plan, then choose
   **Load and validate**.
4. Review PASS, FAIL, REVIEW, and N/A findings. REVIEW means that the HAR-backed
   ERPS evidence is insufficient, commonly because historical GSEP or ESATS
   evidence is required.
5. In **Post-approval automation**, review the records suggested by recovery
   level. Required records are preselected; optional records are not.
6. Confirm the exact records. The extension synchronizes the corresponding
   Orientation, Tabletop, Drill, or Functional date fields on the parent IT
   Plan, then creates the selected Test and Exercise Summary records.
7. The extension never updates ERPS as a side effect of running validation.
   Writes begin only after the confirmation dialog.

The post-approval date defaults to the ERPS Plan Approval Date. Every create is
checked against the recovery-level matrix, and an existing record with the same
application, validation type, and date is skipped. This makes a retry safe after
a partial network failure: already confirmed records are not recreated.

## Safety and data handling

The extension uses the existing ERPS browser session with
`credentials: "include"`. It does not request cookie access, read authorization
headers, inject scripts into pages, or persist full plan data. The latest
sanitized validation result and UI preferences are stored locally. Creation
requests are not automatically retried, preventing duplicate records after an
ambiguous network failure.

## Verification boundary

Unit tests, HAR contract checks, generated-manifest checks, and static package
checks are local evidence only. Live ERPS writes and historical ESATS/GSEP
checks require an authorized signed-in Boeing browser profile.
