# Navigate the Data Communities

A lightweight, embeddable navigation tree for Collibra that surfaces communities where the **Navigator** resource role has been assigned. Users can browse the full community hierarchy, expand or collapse branches on demand, and filter by name — all without leaving their Collibra dashboard.

---

## How it works

The widget queries the Collibra GraphQL API for any community that has a resource role named **Navigator** assigned to it. It does not matter which user or group holds that role — the presence of the assignment is what causes the community to appear in the tree.

Child communities are loaded lazily: the widget fetches only the first level on page load, then loads each branch on first expand. This keeps the initial load fast regardless of how large your community structure is.

---

## Prerequisites

### 1. Create the Navigator resource role

Before deploying the widget, you must have a Collibra resource role called exactly **Navigator** (case-sensitive).

1. In Collibra, go to **Settings → Roles**.
2. Create a new **Resource Role** named `Navigator`.
3. Assign this role to any community you want to appear in the tree — the assignee (user or group) does not matter, only the assignment itself.

> **Tip:** A community with the Navigator role will appear as a root node in the tree. Any child communities beneath it are loaded automatically and do not need the role themselves.

---

## Files

| File | Purpose |
|---|---|
| `tree.html` | Entry point. Mount the widget here, or copy the mount point into your own page. |
| `tree.css` | All styling. Every visual value is a CSS custom property — override tokens in your own stylesheet without touching this file. |
| `tree.js` | Self-contained JavaScript module. Handles auth, GraphQL queries, lazy loading, expand/collapse, and filtering. |

---

## Deployment — Collibra Console (Backup/Restore method)

Collibra does not provide a direct file upload UI for dashboard assets. The supported method is to inject files into the **Customizations** backup archive and restore it into your environment.

### Step 1 — Create a Customizations backup

1. Open the **Collibra Console**.
2. Navigate to **Console Export Files**.
3. Click **Create Console Export File**.
4. Under backup scope, select **Customizations only**.
5. Wait for the backup to complete, then **Download** the resulting `.zip` file.

### Step 2 — Add the widget files to the archive

The backup zip contains a folder structure that includes a `resources/images/` directory. This is where Collibra serves static files from.

1. Open the downloaded `.zip` file with **7-Zip**, WinZip, macOS Archive Utility, or any tool that supports editing zip archives in place.
2. Navigate inside the zip to the `resources/images/` folder. Create it if it does not exist.
3. Add or update the following three files into that folder:
   - `tree.html`
   - `tree.css`
   - `tree.js`
4. Save/close the archive without extracting it.

> **Important:** All three files must be in the same folder (`resources/images/`) so that `tree.html` can reference `tree.css` and `tree.js` by relative path.

### Step 3 — Restore the archive

1. Return to **Collibra Console → Console Export Files**.
2. Click **Upload Console Export File - Restore**.
3. Upload the modified `.zip` file.
4. Confirm the restore. Collibra will apply the Customizations changes without affecting your data.

---

## Add to a Dashboard

1. Open or create a Collibra **Dashboard**.
2. Add an **Embed Widget** to the dashboard.
3. Set the URL to:
   ```
   /resources/images/tree.html
   ```
4. **Uncheck "Run in sandbox"** — the widget must be able to make authenticated requests to the Collibra API. Sandbox mode blocks these requests.
5. Save the dashboard.

The tree will render inside the embed widget, automatically authenticating as the logged-in user via the existing Collibra session.

---

## Theming

All visual values are CSS custom properties defined in `tree.css`. Create a separate override file and link it **after** `tree.css` in `tree.html` — you never need to edit `tree.css` directly.

```css
/* my-theme.css */
:root {
  --tree-font:       'Your Brand Font', system-ui, sans-serif;
  --tree-text:       #1a1a2e;
  --tree-hover:      rgba(0, 82, 204, 0.06);
  --tree-active:     rgba(0, 82, 204, 0.12);
  --tree-guide:      rgba(0, 82, 204, 0.15);
}
```

Then in `tree.html`:

```html
<link rel="stylesheet" href="tree.css">
<link rel="stylesheet" href="my-theme.css">  <!-- your overrides -->
```

### Available tokens

| Token | Default | Controls |
|---|---|---|
| `--tree-font` | `system-ui, …` | Font stack (no external font loaded by default) |
| `--tree-font-size` | `13px` | Base font size |
| `--tree-font-size-sm` | `11px` | Button, search input, loading text |
| `--tree-line-height` | `1.5` | Row line height |
| `--tree-text` | `currentColor` | Primary text (inherits from host page) |
| `--tree-text-muted` | `rgba(0,0,0,0.40)` | Loading / empty state text |
| `--tree-hover` | `rgba(0,0,0,0.04)` | Row hover background |
| `--tree-active` | `rgba(0,0,0,0.07)` | Selected row background |
| `--tree-guide` | `rgba(0,0,0,0.10)` | Vertical connector line |
| `--tree-error` | `#c0392b` | Error message text |
| `--tree-indent` | `20px` | Horizontal indent per depth level |
| `--tree-row-height` | `28px` | Minimum row height |
| `--tree-duration` | `0.18s` | Expand/collapse animation duration |
| `--tree-easing` | `ease` | Expand/collapse animation easing |

---

## JavaScript API

The `NavTree` module is exposed as a global on the page. You can call its methods from your own scripts.

```js
// Render the tree inside the element with id="nav-tree-root"
NavTree.init('nav-tree-root');

// Toggle expand-all / collapse-all (same as the button)
NavTree.toggleTree();

// Filter rows to those whose name contains the query string.
// Pass an empty string to clear the filter.
NavTree.applySearch('logistics');
```

---

## Notes

- The widget authenticates using the active Collibra browser session. No credentials are stored or hardcoded.
- The CSRF token is fetched automatically from `/rest/2.0/auth/sessions/current` before any write-capable request.
- Community links open in a new tab pointing to `{baseURL}/community/{UUID}`.
- The widget has no external dependencies and makes no requests to the public internet.
