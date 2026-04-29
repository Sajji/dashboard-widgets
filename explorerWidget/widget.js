const baseURL = `${location.protocol}//${location.host}`;
const api = path => fetch(`${baseURL}/rest/2.0${path}`, { credentials: 'include' }).then(r => r.json());
const countCache = {};

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

async function gql(query, csrf) {
  const res = await fetch(`${baseURL}/graphql/knowledgeGraph/v1`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors && json.errors.length) throw new Error(json.errors[0].message);
  return json.data;
}

async function init() {
  const csrfRes = await fetch(
    `${baseURL}/rest/2.0/auth/sessions/current?include=csrfToken`,
    { credentials: 'include' }
  );
  const csrf = (await csrfRes.json()).csrfToken;

  const [gqlData, domData] = await Promise.all([
    gql(NAVIGATOR_QUERY, csrf),
    api('/domains?offset=0&limit=1000&excludeMeta=true&sortField=NAME&sortOrder=ASC')
  ]);

  const navCommunities = gqlData.communities || [];

  const commMap = {};
  navCommunities.forEach(c => commMap[c.id] = { ...c, children: [], domains: [] });
  domData.results.forEach(d => {
    if (d.community && commMap[d.community.id]) commMap[d.community.id].domains.push(d);
  });

  const roots = [];
  navCommunities.forEach(c => {
    const pid = c.parent?.id;
    (pid && commMap[pid]) ? commMap[pid].children.push(commMap[c.id]) : roots.push(commMap[c.id]);
  });

  const sort = a => a.sort((x, y) => x.name.localeCompare(y.name));
  Object.values(commMap).forEach(c => { sort(c.children); sort(c.domains); });
  sort(roots);

  document.getElementById('stats').textContent =
    `${navCommunities.length} communities · ${domData.results.length} domains`;
  renderTree(roots);
  preloadAllCounts(Object.values(commMap));

  document.getElementById('search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.node').forEach(n => {
      const text = n.dataset.name.toLowerCase();
      const match = !q || text.includes(q);
      n.style.display = match ? '' : 'none';
      if (match && q) expandParents(n);
    });
  });
}

function expandParents(el) {
  let parent = el.parentElement?.closest('.node');
  while (parent) {
    parent.classList.add('open');
    parent = parent.parentElement?.closest('.node');
  }
}

function renderTree(roots) {
  const tree = document.getElementById('tree');
  tree.innerHTML = '';
  if (!roots.length) { tree.innerHTML = '<div class="empty">No communities found</div>'; return; }
  roots.forEach(c => tree.appendChild(buildNode(c)));
}

function buildNode(community) {
  const hasChildren = community.children.length || community.domains.length;
  const node = document.createElement('div');
  node.className = 'node';
  node.dataset.name = community.name;

  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <span class="chevron">${hasChildren ? '▸' : ''}</span>
    <span class="icon community-icon">C</span>
    <span class="label">${esc(community.name)}</span>
    <span class="count" data-community-id="${community.id}">…</span>
  `;

  const childWrap = document.createElement('div');
  childWrap.className = 'children';

  community.children.forEach(c => childWrap.appendChild(buildNode(c)));
  community.domains.forEach(d => childWrap.appendChild(buildDomainNode(d)));

  if (hasChildren) {
    row.addEventListener('click', () => {
      node.classList.toggle('open');
      loadCounts(community);
    });
  }

  node.appendChild(row);
  node.appendChild(childWrap);
  return node;
}

function buildDomainNode(domain) {
  const node = document.createElement('div');
  node.className = 'node domain-node';
  node.dataset.name = domain.name;
  node.innerHTML = `
    <div class="row">
      <span class="chevron"></span>
      <span class="icon domain-icon">D</span>
      <span class="label">${esc(domain.name)}</span>
      <span class="count" data-domain-id="${domain.id}">…</span>
    </div>
  `;
  return node;
}

async function loadCounts(community) {
  const load = async (param, id, attr) => {
    if (countCache[id] !== undefined) return;
    countCache[id] = null;
    try {
      const data = await api(`/assets?${param}=${id}&offset=0&limit=1&countLimit=-1`);
      countCache[id] = data.total;
      document.querySelectorAll(`[data-${attr}="${id}"]`).forEach(el =>
        el.textContent = data.total.toLocaleString()
      );
    } catch { countCache[id] = '—'; }
  };

  load('communityId', community.id, 'community-id');
  community.domains.forEach(d => load('domainId', d.id, 'domain-id'));
}

function preloadAllCounts(communities) {
  communities.forEach(c => loadCounts(c));
}

const esc = s => s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);

init();
