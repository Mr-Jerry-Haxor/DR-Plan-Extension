import {
  cp,
  mkdir,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const version = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version;

const common = {
  manifest_version: 3,
  name: "DR Plan Review and Automation",
  version,
  description: "Validate ERPS disaster recovery plans and prepare confirmed post-approval validation records.",
  permissions: ["storage"],
  host_permissions: [
    "https://boeing.continuitylogic.com/*",
    "https://us-gov-rest-prd-formbuilder.continuitylogic.com/*"
  ],
  action: {
    default_title: "Open DR Plan side pane"
  },
  content_scripts: [
    {
      matches: ["https://boeing.continuitylogic.com/*"],
      js: ["content_script.js"],
      css: ["content_script.css"],
      run_at: "document_idle"
    }
  ],
  web_accessible_resources: [
    {
      resources: ["popup.html"],
      matches: ["https://boeing.continuitylogic.com/*"]
    }
  ],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'"
  }
};

const manifests = {
  chromium: {
    ...common,
    minimum_chrome_version: "116",
    permissions: [...common.permissions, "sidePanel"],
    background: { service_worker: "service_worker.js" },
    side_panel: { default_path: "popup.html?view=side-panel" }
  },
  firefox: {
    ...common,
    background: { scripts: ["service_worker.js"] },
    sidebar_action: {
      default_title: "DR Plan Review and Automation",
      default_panel: "popup.html?view=sidebar",
      open_at_install: true
    },
    browser_specific_settings: {
      gecko: {
        id: "dr-plan-review@boeing.internal",
        strict_min_version: "142.0",
        data_collection_permissions: { required: ["none"] }
      }
    }
  }
};

const shipped = [
  "popup.html",
  "popup.css",
  "popup.js",
  "service_worker.js",
  "content_script.js",
  "content_script.css",
  "core",
  "checkpoints"
];

const resolvedDist = path.resolve(dist);
if (resolvedDist === root || !resolvedDist.startsWith(`${root}${path.sep}`)) {
  throw new Error(`Refusing to clean unexpected path: ${resolvedDist}`);
}

await rm(resolvedDist, { recursive: true, force: true });

for (const [target, manifest] of Object.entries(manifests)) {
  const targetDir = path.join(resolvedDist, target);
  await mkdir(targetDir, { recursive: true });
  for (const item of shipped) {
    await cp(path.join(root, item), path.join(targetDir, item), { recursive: true });
  }
  await writeFile(
    path.join(targetDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}

console.log("Built dist/chromium and dist/firefox from shared sources.");
