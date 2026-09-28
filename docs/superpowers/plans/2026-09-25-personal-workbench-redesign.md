# Personal Workbench Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local PM2 console a personal workbench that clearly reports watched service health, manages all visible local processes safely, and quickly opens registered software and work items.

**Architecture:** Keep the existing Express/PM2 host and plugin-based workbench. Extend the host's Windows process inventory with explicit ownership/protection metadata, make workbench records directly searchable and openable, and expose a small set of software entry capabilities (open locally, manage through PM2, or deep integration through a selected plugin). Do not embed a separate dashboard or add automatic arbitrary GitHub downloads.

**Tech Stack:** Node.js CommonJS, Express, PM2 Node API, native HTML/CSS/JavaScript, Windows CIM/Explorer.

**Spec:** `docs/superpowers/specs/2026-09-25-personal-workbench-redesign-design.md`

## Global Constraints

- The user uses the web UI on one Windows computer; the service remains bound to `127.0.0.1`.
- Account/password files are references only; never read, index, copy, or persist their contents.
- Global search covers PM2 processes, software entries, plugins, and saved workbench items; it does not scan the disk.
- PM2 import starts a new process from explicit configuration; it does not attach to an existing PID.
- System/protected processes remain visible but receive no terminate/import action.
- A process is called healthy only when a configured health probe passes; otherwise display “未监测”.
- Do not add software downloads, remote plugin installation, another deployment system, or a new runtime dependency.

## Review Focus

- PID reuse between scan and terminate: re-read the process identity immediately before termination and refuse if it changed.
- CIM fields unavailable due to permissions: show the row with unknown details and disable unsafe actions.
- PM2 OS PID differs from PM2 id: resolve the inventory row to the PM2 id before start/stop/restart.
- Windows paths with spaces and files vs directories: quote/argument handling must open/select the intended target and report launch errors.
- Duplicate executable instances: watching a process must use a stable fingerprint and show ambiguity rather than silently binding to the wrong PID.

---

## File Map

- `server.js`: query and classify the complete process inventory; safely resolve PM2 ownership and terminate only a freshly verified ordinary process.
- `lib/operations.js`: pure process classification/fingerprint helpers if they remain useful outside one route.
- `plugins/workbench/server.js`: allow opening/revealing valid local targets, expose workspace-root opening, and support records without a required workspace.
- `lib/workbench.js`: normalize optional workspace assignment and software entry targets without executing target paths.
- `plugins/workbench/workbench.js`: quick add, open/reveal/copy actions, root shortcut, and expose workbench search/open methods to the host.
- `plugins/workbench/card.html`, `plugins/workbench/workbench.css`: workbench toolbar and direct-access affordances.
- `public/index.html`: full process inventory table and filters, consistent state labels, cross-app quick search, software entry navigation and result actions.
- `README.md`, `DEPLOY.md`: explain process actions, health/attention distinction, quick search, and software registration modes.

## Implementation Tasks

### Task 1: Complete Process Inventory and Safe Actions

**Interfaces:**
- `GET /api/discover` returns every CIM process row with `pid`, `name`, nullable `exe` and `cmdline`, `session`, `createdAt`, `owner` (`pm2`/`external`), nullable `pm2Id`, and `protected` boolean plus `protectionReason`.
- `POST /api/discover/:pid/kill` accepts the scanned identity fields and returns 409 if the process is missing or its identity changed.
- PM2-owned rows use `/api/processes/:id/action` with `pm2Id`; external termination never targets a protected or unidentified row.

- [x] Preserve all CIM rows, including rows missing executable path or command line; attach PM2 ownership by OS PID and sort by name then PID.
- [x] Mark system-session and Windows system-directory processes as protected; keep user-shell processes visible rather than hiding them by executable name.
- [x] Before external termination, query that PID again and compare name, executable path, and creation time; refuse if the scan is stale, the PID is absent, or identity differs.
- [x] Return explicit authorization, stale-process, and access-denied errors; never report `stopped: true` when `taskkill` failed or the PID remains alive.
- [x] Move process discovery into the Service page as “本机全部进程”; show total count, scan time/error, owner/protection labels, and filters for name/path/PID/type.
- [x] Render PM2 rows with PM2 detail/restart/stop actions; render eligible external rows with watch, PM2 import, and confirmed termination; hide unsafe actions for protected/unknown rows.
- [x] Keep safe handoff; show that PM2 starts a replacement and never close the original before verification and explicit confirmation.

### Task 2: Separate Watched, Health, and Recovery States

**Interfaces:**
- Service cards and detail use separate fields for `watched`, `pm2Managed`, `health`/`hasHealth`, and recovery snapshot state.
- The overview labels unknown probe state as “未监测” and only shows “健康” after a passing configured HTTP(S) probe.

- [x] Update overview and watched cards to show PM2 connection, process state, health state, and last refresh time as separate values.
- [x] Add a durable local watch record using executable path and normalized command line; display active PID, missing, or ambiguous matches without implying PM2 recovery.
- [x] Allow removing an external watch record; keep PM2 `watched` metadata behavior intact.
- [ ] Keep snapshot success independent from the process action result; show last successful `pm2 save` separately from configured Windows login recovery.
- [ ] Ensure action completion refreshes service/watch state and gives an inline result with the next step, such as logs, health-check setup, or correcting the launch command.

### Task 3: Make Workbench Entries Direct and Reliable

**Interfaces:**
- `GET /api/workbench` continues returning spaces/items and target status; an item's `workspaceId` may be null.
- `POST /api/workbench/items/:id/open` opens a valid target and reports an explicit `action`/`opened` kind or a launch error.
- `POST /api/workbench/items/:id/reveal` works for an existing directory, existing file, or missing file target whose parent exists.
- `POST /api/workbench/workspaces/:id/open-root` opens the configured root when it exists.

- [x] Normalize workbench items without requiring a space; preserve existing workspace records and allow direct additions.
- [x] Keep optional workspace selection and an “未归类” choice; add “打开根目录” to workspace details.
- [x] Provide per-item open, reveal-folder, copy-address, edit, favorite, and delete actions where applicable.
- [x] Implement reveal rules for existing directories/files and missing targets' nearest existing parents.
- [x] Observe child `error` events and surface truthful launch errors in the UI.
- [ ] Keep account-file behavior path-only and keep unsafe executable/command file restrictions.

### Task 4: Unified Search and Software Entry Capabilities

**Interfaces:**
- Add a host search overlay opened by the search control and `Ctrl+K`; `Escape` closes it, arrow keys select, and `Enter` runs the selected action.
- `window.workbenchPlugin.searchEntries(query)` returns saved items with `id`, `title`, `type`, `target`, `workspaceName`, `starred`, and `targetStatus`.
- `window.workbenchPlugin.openEntry(id, action)` opens the saved entry or its containing folder and returns a result/error to the host.
- Workbench type `software` records an existing local executable or HTTP(S) web app. PM2-managed software links an existing PM2 service or uses the normal “拉入程序” flow; a software record alone never implies PM2 ownership.

- [x] Add global search in the host shell with `Ctrl+K`, Escape, arrow navigation, Enter, and results for PM2, scanned processes, plugins, and workbench entries.
- [x] Search only loaded/local metadata and debounce input; process results require a prior process scan.
- [x] Expose workbench search/open methods after plugin initialization without blocking PM2 search.
- [x] Add a local software type for existing `.exe` and `.lnk` targets; retain separate link and PM2-service entry types.
- [x] Keep quick-open, PM2 management, and plugin integrations distinct; do not auto-download or execute GitHub projects.
- [ ] Keep GitHub candidate review as a documented/manual decision flow for each requested application; do not add an in-app GitHub crawler or software marketplace before there is a concrete app to integrate.
- [ ] Add favorite/recent actions from search results and service details without duplicating the workbench entry form.

### Task 5: Documentation and Delivery Review

- [x] Update `README.md` daily workflow for overview, full process inventory, process controls, and unified search.
- [x] Update `DEPLOY.md` for Windows folder opening and distinguish process watch from PM2 recovery.
- [ ] Check all UI text against actual backend actions: no “全部进程” claim if the OS query failed; no “已健康” without a passing health check; no “已接管” when a new PM2 instance was started.
- [ ] Run static JavaScript syntax checks and perform a browser/manual acceptance pass without terminating/importing the user's real processes.
- [ ] Review the final diff for unrelated changes, secret exposure, unsafe path execution, and regressions in existing plugin/project routes.

## Acceptance Walkthrough

1. Open the console and tell whether PM2 is connected, watched services are running, configured health checks pass, and any service needs attention.
2. Open the complete local process list; verify PM2 and Windows/system rows remain visible, search by name/path/PID, and observe unsafe actions disabled for protected or unreadable rows.
3. Add an ordinary process to watch, then refresh the page; verify the watch persists and is not labeled PM2-managed or recoverable.
4. Open a saved folder, file, missing target, and workspace root; each action either opens the expected Explorer location or shows a clear error in the page.
5. Search for a PM2 service, local software entry, URL, and saved work item from the same search field; open each without navigating through workspace folders.
6. Register software as quick-open and confirm it is not shown as PM2-managed; associate a PM2 service separately and confirm the correct controls appear.
7. Review a proposed GitHub tool and see maintenance, license, Windows compatibility, requirements, and recommendation before choosing a connection method.
