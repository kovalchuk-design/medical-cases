# Repo rules for Claude

- Owner: Sergei K., Senior UX/UI Product Designer. Reply in Ukrainian; UI copy, case text and commit messages in English.
- Purpose: working showcase of 11 healthcare concept cases. Push straight to `main` (agreed fast mode); GitHub Pages deploys on push.
- Static HTML/CSS/vanilla JS, no build step, no frameworks unless the owner asks.
- Each case in `cases/<slug>/` is self-contained: own `tokens.css`, fonts and components. Never share tokens or components between cases. `portfolio/` is only the shell (index + case bar).
- Case data for the index lives in `portfolio/cases.js` — update it when a case's status, cover or Figma link changes.
- Honesty: label cases "Concept / self-initiated"; metrics are "projected" or from usability tests; synthetic data only; no real brands (EHR vendors, insurers, drug trade names).
- WCAG 2.2 AA on every page: contrast ≥ 4.5:1, visible focus, keyboard reachable, alt text, reduced motion respected.
- Source of truth for case content: Claude Docs doc "Medical Portfolio: 10 Healthcare Product Directions & PRDs" (https://claude.ai/artifact/WZiAAYqweMMGzSEE6YEHdB), one tab per PRD. Case 11 (Rounds) has no PRD.

## Figma files

| Case | Figma file key | Cover node (1600×1200 export unless noted) |
|---|---|---|
| 01 Rosterline | Xpl0Fa7f8VpRiwWe2F6znZ | 142:3388 |
| 02 Attest | 36fjAO68F9iPxaKCT7K50i | 164:2065 |
| 03 VisitReady | YxaZkKeULhsAPNH6qI1GjX | 15:148 (1920×1080) |
| 11 Rounds | WJLm1lMxLmretjcMmGhqRy | 257:616 |

Screen node IDs for VisitReady are in `cases/03-visitready/index.html` (`FLOWS`), with target file names under `screens/`.

## Exporting from Figma

`get_screenshot` returns a short-lived `www.figma.com` URL; download it with curl into the case folder. This needs a session on the `medical-cases` cloud environment (allows www.figma.com and Google Fonts). The Default environment blocks www.figma.com.

## Checking pages

Serve with `python3 -m http.server`, screenshot with Playwright (pre-installed) at 1440 and 390 widths before pushing visual changes.
