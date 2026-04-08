/**
 * tree.js — Navigator Community Tree
 *
 * Self-contained module. Call NavTree.init(containerId) once the
 * DOM is ready. The module reads window.location.origin as the
 * Collibra base URL, so no configuration is required when the file
 * is served from the Collibra host.
 *
 * PUBLIC API
 * ----------
 *   NavTree.init(containerId)
 *     Bootstraps the widget inside the element with the given id.
 *
 *   NavTree.applySearch(query)
 *     Filters visible rows to those whose name contains `query`
 *     (case-insensitive). Pass an empty string to clear the filter.
 *     Useful if the host page wants to wire up its own search input.
 *
 *   NavTree.toggleTree()
 *     Expands the entire tree if currently collapsed, collapses it if
 *     expanded. Lazily fetches all children as it goes. The button
 *     label updates automatically to reflect the current state.
 */

const NavTree = (() => {
  'use strict';

  /* ── Internal state ──────────────────────────────────────────────────────── */

  const BASE    = window.location.origin;
  let   CSRF    = null;
  let   NODE_MAP = new Map();   // id → node object; grows as children load


  /* ── Utilities ───────────────────────────────────────────────────────────── */

  function esc(s) {
    return String(s)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;');
  }


  /* ── API ─────────────────────────────────────────────────────────────────── */

  async function gql(query) {
    const res = await fetch(`${BASE}/graphql/knowledgeGraph/v1`, {
      method:      'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF,
      },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors && json.errors.length) throw new Error(json.errors[0].message);
    return json.data;
  }


  /* ── GraphQL queries ─────────────────────────────────────────────────────── */

  /*
   * Initial load — fetch all communities that carry a Navigator role.
   * subCommunities { id } is included only to determine hasChildren
   * without loading all child data upfront.
   */
  const NAVIGATOR_QUERY = `
    query NavigatorCommunities {
      communities(
        where: { responsibilities: { any: { role: { name: { eq: "Navigator" } } } } }
      ) {
        id
        name
        parent { id name }
        subCommunities { id }
      }
    }
  `;

  /*
   * Lazy load — fetches the immediate children of a given community.
   * Also grabs subCommunities { id } on each child to know whether
   * *it* has children (so the expand arrow is shown correctly).
   */
  function childrenQuery(parentId) {
    return `
      query Children {
        communities(where: { parent: { id: { eq: "${parentId}" } } }) {
          id
          name
          subCommunities { id }
        }
      }
    `;
  }


  /* ── Node model ──────────────────────────────────────────────────────────── */

  /*
   * node = {
   *   id:             string
   *   name:           string
   *   isNavigator:    boolean
   *   hasChildren:    boolean   — from subCommunities.length > 0
   *   childrenLoaded: boolean   — true after the first lazy fetch
   *   children:       node[]
   * }
   */
  function makeNode(raw, isNavigator) {
    return {
      id:             raw.id,
      name:           raw.name,
      isNavigator:    !!isNavigator,
      hasChildren:    (raw.subCommunities || []).length > 0,
      childrenLoaded: false,
      children:       [],
    };
  }

  function buildInitialTree(navCommunities) {
    // Register all navigator communities
    for (const c of navCommunities) {
      NODE_MAP.set(c.id, makeNode(c, true));
    }

    // Wire parent-child links for navigator communities whose
    // parent is *also* a navigator community (already in NODE_MAP).
    // Those whose parent is absent or outside the set become roots.
    const roots = [];
    for (const c of navCommunities) {
      const node = NODE_MAP.get(c.id);
      if (c.parent && NODE_MAP.has(c.parent.id)) {
        NODE_MAP.get(c.parent.id).children.push(node);
      } else {
        roots.push(node);
      }
    }

    sortNodes(roots);
    return roots;
  }

  function sortNodes(arr) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
    arr.forEach(n => sortNodes(n.children));
  }


  /* ── HTML generation ─────────────────────────────────────────────────────── */

  function nodeHTML(node, depth) {
    const communityURL = `${BASE}/community/${encodeURIComponent(node.id)}`;

    /*
     * Row left-padding = base padding + (depth × indent-per-level).
     * The guide-line margin pushes the vertical connector so it sits
     * under the chevron's visual centre.
     */
    const padLeft   = 12 + depth * 20;
    const guideLeft = padLeft + 8;

    const chevron = node.hasChildren
      ? `<span class="nav-tree__chevron" aria-hidden="true">&#9658;</span>`
      : `<span class="nav-tree__chevron-gap" aria-hidden="true"></span>`;

    const badge = '';

    const children = node.hasChildren
      ? `<div class="nav-tree__children" id="cw-${esc(node.id)}"
              style="margin-left:${guideLeft}px">
           <div class="nav-tree__children-inner" id="ci-${esc(node.id)}"></div>
         </div>`
      : '';

    return `
      <div class="nav-tree__node" data-id="${esc(node.id)}">
        <div class="nav-tree__row"
             data-id="${esc(node.id)}"
             data-depth="${depth}"
             style="padding-left:${padLeft}px"
             role="treeitem"
             aria-expanded="${node.hasChildren ? 'false' : undefined}">
          ${chevron}
          <span class="nav-tree__name">
            <a href="${esc(communityURL)}"
               target="_blank"
               rel="noopener"
               onclick="event.stopPropagation()"
               title="${esc(node.name)}">
              ${esc(node.name)}
            </a>
          </span>
          ${badge}
        </div>
        ${children}
      </div>`;
  }


  /* ── Expand / collapse ───────────────────────────────────────────────────── */

  async function expandNode(nodeId, row) {
    const node = NODE_MAP.get(nodeId);
    if (!node || !node.hasChildren) return;

    const cw = document.getElementById(`cw-${nodeId}`);
    const ci = document.getElementById(`ci-${nodeId}`);
    if (!cw || !ci) return;

    const depth = parseInt(row.dataset.depth, 10) || 0;

    if (!node.childrenLoaded) {
      // Show inline spinner
      ci.innerHTML = `
        <div class="nav-tree__loading-row" style="padding-left:${12 + (depth + 1) * 20}px">
          <div class="nav-tree__spinner"></div>
          <span>Loading&hellip;</span>
        </div>`;
      cw.classList.add('open');
      row.querySelector('.nav-tree__chevron')?.classList.add('open');
      row.setAttribute('aria-expanded', 'true');

      try {
        const data     = await gql(childrenQuery(nodeId));
        const children = (data.communities || []).map(c => makeNode(c, false));
        children.sort((a, b) => a.name.localeCompare(b.name));

        // Register children in NODE_MAP
        children.forEach(c => NODE_MAP.set(c.id, c));
        node.children       = children;
        node.childrenLoaded = true;
        ci.innerHTML        = '';

        if (children.length === 0) {
          // No real children — remove expand affordance
          node.hasChildren = false;
          const chev = row.querySelector('.nav-tree__chevron');
          if (chev) chev.outerHTML = `<span class="nav-tree__chevron-gap" aria-hidden="true"></span>`;
          cw.classList.remove('open');
          row.setAttribute('aria-expanded', 'false');
          return;
        }

        ci.insertAdjacentHTML('beforeend',
          children.map(c => nodeHTML(c, depth + 1)).join(''));

      } catch (err) {
        ci.innerHTML = `
          <div class="nav-tree__loading-row"
               style="padding-left:${12 + (depth + 1) * 20}px">
            <div class="nav-tree__error">&#9888; ${esc(err.message)}</div>
          </div>`;
      }

    } else {
      // Already loaded — just open
      cw.classList.add('open');
      row.querySelector('.nav-tree__chevron')?.classList.add('open');
      row.setAttribute('aria-expanded', 'true');
    }
  }

  function collapseNode(nodeId, row) {
    const cw = document.getElementById(`cw-${nodeId}`);
    if (cw) cw.classList.remove('open');
    row.querySelector('.nav-tree__chevron')?.classList.remove('open');
    row.setAttribute('aria-expanded', 'false');
  }


  /* ── Toggle state ────────────────────────────────────────────────────────── */

  let _expanded = false;


  /* ── Public: toggleTree ──────────────────────────────────────────────────── */

  async function toggleTree() {
    const btn = document.querySelector('[data-action="toggle-tree"]');
    if (_expanded) {
      collapseAll();
      _expanded = false;
      if (btn) btn.textContent = 'Expand All';
    } else {
      if (btn) { btn.disabled = true; btn.textContent = 'Expanding…'; }
      const queue = [...document.querySelectorAll('.nav-tree__row[data-id]')]
        .map(row => ({ id: row.dataset.id, row }))
        .filter(({ id }) => { const n = NODE_MAP.get(id); return n && n.hasChildren; });
      for (const { id, row } of queue) {
        const cw = document.getElementById(`cw-${id}`);
        if (!(cw && cw.classList.contains('open') && NODE_MAP.get(id)?.childrenLoaded)) {
          await expandNode(id, row);
        }
        const node = NODE_MAP.get(id);
        if (node && node.children) {
          for (const child of node.children) {
            if (child.hasChildren) {
              const childRow = document.querySelector(`.nav-tree__row[data-id="${child.id}"]`);
              if (childRow) queue.push({ id: child.id, row: childRow });
            }
          }
        }
      }
      _expanded = true;
      if (btn) { btn.disabled = false; btn.textContent = 'Collapse All'; }
    }
  }


  /* ── Internal: collapseAll ───────────────────────────────────────────────── */

  function collapseAll() {
    document.querySelectorAll('.nav-tree__children.open')
      .forEach(el => el.classList.remove('open'));
    document.querySelectorAll('.nav-tree__chevron.open')
      .forEach(el => el.classList.remove('open'));
    document.querySelectorAll('.nav-tree__row[aria-expanded="true"]')
      .forEach(el => el.setAttribute('aria-expanded', 'false'));
    _expanded = false;
    const btn = document.querySelector('[data-action="toggle-tree"]');
    if (btn) btn.textContent = 'Expand All';
  }

  function applySearch(query) {
    const q = query.trim().toLowerCase();

    // Clear previous state
    document.querySelectorAll('.nav-tree__row.search-hidden')
      .forEach(r => r.classList.remove('search-hidden'));
    document.querySelectorAll('.nav-tree__row.search-match')
      .forEach(r => r.classList.remove('search-match'));

    if (!q) return;

    // Mark rows
    document.querySelectorAll('.nav-tree__row[data-id]').forEach(row => {
      const name  = row.querySelector('.nav-tree__name a')?.textContent?.toLowerCase() || '';
      const match = name.includes(q);
      row.classList.toggle('search-match',  match);
      row.classList.toggle('search-hidden', !match);
    });

    // Reveal ancestors of matched rows
    document.querySelectorAll('.nav-tree__row.search-match').forEach(row => {
      let el = row.parentElement;
      while (el) {
        const cw = el.closest('.nav-tree__children');
        if (!cw) break;
        cw.classList.add('open');
        const parentRow = cw.parentElement?.querySelector(':scope > .nav-tree__row');
        if (parentRow) {
          parentRow.classList.remove('search-hidden');
          parentRow.querySelector('.nav-tree__chevron')?.classList.add('open');
        }
        el = cw.parentElement;
      }
    });
  }


  /* ── Event wiring ────────────────────────────────────────────────────────── */

  function wireContainer(container) {
    container.addEventListener('click', async e => {
      // Let anchor clicks through
      if (e.target.closest('a')) return;

      // Button actions
      const btn = e.target.closest('[data-action]');
      if (btn) {
        const action = btn.dataset.action;
        if (action === 'toggle-tree') { await toggleTree(); return; }
      }

      // Row toggle
      const row = e.target.closest('.nav-tree__row[data-id]');
      if (!row) return;

      const id   = row.dataset.id;
      const node = NODE_MAP.get(id);
      if (!node) return;

      // Active highlight
      document.querySelectorAll('.nav-tree__row.active')
        .forEach(r => r.classList.remove('active'));
      row.classList.add('active');

      if (!node.hasChildren) return;

      const cw = document.getElementById(`cw-${id}`);
      if (cw?.classList.contains('open')) collapseNode(id, row);
      else await expandNode(id, row);
    });
  }


  /* ── Public: init ────────────────────────────────────────────────────────── */

  async function init(containerId) {
    // Reset state (supports re-initialisation)
    NODE_MAP = new Map();
    CSRF     = null;

    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`[NavTree] No element found with id "${containerId}"`);
      return;
    }

    container.classList.add('nav-tree');
    container.innerHTML = `
      <div class="nav-tree__toolbar">
        <button class="nav-tree__btn" data-action="toggle-tree">Expand All</button>
      </div>
      <div class="nav-tree__body" id="${containerId}-body" role="tree">
        <div class="nav-tree__loading-row">
          <div class="nav-tree__spinner"></div>
          <span>Loading&hellip;</span>
        </div>
      </div>`;

    wireContainer(container);

    const body = document.getElementById(`${containerId}-body`);

    try {
      // Fetch CSRF token (session-based auth, no credentials stored in code)
      const csrfRes = await fetch(
        `${BASE}/rest/2.0/auth/sessions/current?include=csrfToken`,
        { credentials: 'include' }
      );
      CSRF = (await csrfRes.json()).csrfToken;

      // Fetch navigator communities
      const gqlData        = await gql(NAVIGATOR_QUERY);
      const navCommunities = gqlData.communities || [];
      const roots          = buildInitialTree(navCommunities);

      body.innerHTML = roots.length
        ? roots.map(n => nodeHTML(n, 0)).join('')
        : '<div class="nav-tree__empty">No Navigator communities found.</div>';

    } catch (err) {
      console.error('[NavTree]', err);
      body.innerHTML = `
        <div class="nav-tree__error">
          Failed to load community data: ${esc(err.message)}
        </div>`;
    }
  }


  /* ── Public surface ──────────────────────────────────────────────────────── */

  return { init, toggleTree, applySearch };

})();
