# Repo rules for Claude

- Owner: Sergei K., Senior UX/UI Product Designer. Reply in Ukrainian; UI copy, case text and commit messages in English.
- Purpose: **Case Studio** — a Figma-like workspace for 11 healthcare concept cases, and the place where new projects are designed in code (Claude Design is no longer available). Desktop only.
- Push straight to `main` (agreed fast mode); GitHub Pages deploys on push: https://kovalchuk-design.github.io/medical-cases/
- Static HTML/CSS/vanilla ES modules, no build step, no frameworks unless the owner asks. Node scripts in `tools/` run only locally (`npm i` first).
- Each case in `cases/<slug>/` is self-contained: own tokens, fonts and components. Never share them between cases. `studio/` and `portfolio/` are only the chrome.
- Honesty: "Concept / self-initiated"; metrics "projected" or from usability tests; synthetic data; no real brands (EHR vendors, insurers, drug trade names).
- WCAG 2.2 AA for the chrome and for screens in code.
- Case content source: Claude Docs doc "Medical Portfolio: 10 Healthcare Product Directions & PRDs" (https://claude.ai/artifact/WZiAAYqweMMGzSEE6YEHdB), one tab per PRD. Case 11 (Rounds) has no PRD.
- Approved plan: `/root/.claude/plans/unified-watching-fog.md` in the session that wrote it; summary below.

## How the studio works

- `studio/?case=<slug>&page=<pageId>&node=<nodeId>&v=x,y,zoom` — sidebar = Figma pages (dividers `———` kept) + frames list; canvas = frames at Figma coordinates; `#present/<nodeId>` = presentation.
- Data: `cases/<slug>/manifest.json` (pages → nodes {id,name,type,x,y,w,h,img,scale,parent?,text?} · presentation page also has `flows` and `links` {from,to,label,rect}). Images: `cases/<slug>/img/<id>@1x.webp` and `@2x.webp` (when `scale` ≥ 2).
- Canvas keys: scroll = pan, Ctrl/⌘+scroll = zoom at cursor, drag = pan, click = select, double-click = zoom to frame, Shift+1 fit, Shift+2 selection, Shift+0 100%, +/−, PageUp/PageDown = pages.
- Presentation: hotspots from Figma prototype links; → follows Next/Start/Hotspot, ← follows Back, Esc closes; click outside a hotspot flashes them.
- Index card opens the studio when the case has `studio: true` in `portfolio/cases.js`; otherwise the stub page in `cases/<slug>/index.html`.

## Figma sync (zero-LLM-token import)

```
npm i
node tools/figma-sync.mjs <slug> <fileKey> [--force] [--pages "Cover,▶ Case presentation"]
```
Needs a session on the **`medical-cases`** cloud environment with hosts `api.figma.com` and the S3 host Figma returns image URLs on (check the first failing download; usually `figma-alpha-api.s3.us-west-2.amazonaws.com`), plus a Figma personal access token saved via `request_credential` (host `api.figma.com`, header `X-Figma-Token`, no prefix). Never ask for the token in chat.

| Case | slug | Figma file key | Status |
|---|---|---|---|
| 01 Rosterline | 01-rosterline | Xpl0Fa7f8VpRiwWe2F6znZ | not synced |
| 02 Attest | 02-attest | 36fjAO68F9iPxaKCT7K50i | not synced |
| 03 VisitReady | 03-visitready | YxaZkKeULhsAPNH6qI1GjX | not synced; old hand-made page in `cases/03-visitready/` (replace with studio after sync) |
| 11 Rounds | 11-rounds | WJLm1lMxLmretjcMmGhqRy | synced (10 pages, 236 nodes, 236 images; cover set) |

After a sync: set `cover` and `studio: true` for the case in `portfolio/cases.js`, make `cases/<slug>/index.html` redirect to the studio (see `cases/11-rounds/index.html`).

## Next steps (plan stages)

1. ~~Sync 11 Rounds with images~~ done; still to verify every page against Figma (frame counts per page).
2. Sync 01, 02, 03; real covers on the index.
3. Code-authored cases: `studio/frame-html.js` (live iframes, already supported in `canvas.js` via node `html`), `tools/thumbs.mjs`, auto Style guide / Icons / Components from `tokens.css`, `cases/_template/`; demo with one VisitReady screen.
4. Clean up: old VisitReady page and stubs replaced by the studio; update README.

## Local preview & checks

`node tools/dev-server.mjs 8000` (live reload; report the port with `report_preview_port`). Check with Playwright at 1440×900: no console errors, zoom/fit/selection, presentation path. Screenshots for review at deviceScaleFactor 1.
