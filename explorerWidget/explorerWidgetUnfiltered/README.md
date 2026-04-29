# Collibra Community & Domain Explorer Widget

An interactive tree widget that visualizes the full community → domain hierarchy with live asset counts.

![HTML](https://img.shields.io/badge/HTML-E34F26?logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)

## Preview

The widget renders a collapsible tree with:
- **Communities** (purple) nested by parent hierarchy
- **Domains** (blue) grouped under their parent community
- **Asset counts** per community and domain, loaded on expand
- **Search filter** to quickly locate any community or domain

## How It Works

1. Derives the Collibra base URL from `window.location`
2. Fetches all communities and domains in parallel via the REST API
3. Builds a tree from `parent.id` references (communities) and `community.id` references (domains)
4. When a community is expanded, fetches asset counts for that community and its domains
5. Counts are cached so re-expansion is instant

## Files

| File | Purpose |
|------|---------|
| `widget.html` | Markup — header, search bar, tree container |
| `widget.js` | Data fetching, tree construction, expand/collapse, search |
| `widget.css` | Tree styling, icons, animations, consistent design language |

## Usage

1. In Collibra, navigate to a dashboard and add a new **HTML widget**.
2. Upload or paste the contents of the three files.
3. Save — the widget will load and display the full hierarchy.

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /rest/2.0/communities?offset=0&limit=1000&excludeMeta=true` | Fetch all communities |
| `GET /rest/2.0/domains?offset=0&limit=1000&excludeMeta=true` | Fetch all domains |
| `GET /rest/2.0/assets?communityId={id}&limit=1&countLimit=-1` | Community asset count (lazy) |
| `GET /rest/2.0/assets?domainId={id}&limit=1&countLimit=-1` | Domain asset count (lazy) |

Asset count calls use `limit=1` and read the `total` field from the paged response to minimize data transfer.

## License

MIT
