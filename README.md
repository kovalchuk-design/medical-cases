# Medical cases — healthcare product design portfolio

Working showcase for 11 concept case studies (US healthcare). Static site, no build step, deployed to GitHub Pages on every push to `main`.

## Structure

```
index.html                 Portfolio index: 11 case cards with status filter
portfolio/
  cases.js                 Case list — the one file to edit for titles, taglines, status, Figma links, covers
  shell.css                Portfolio shell style (index + thin bar on case pages)
  case-bar.js              Top bar on case pages (all cases, prev/next) + stub page renderer
cases/
  01-rosterline/ … 11-rounds/
    index.html             Case page (stub until the case gets its own page)
    tokens.css             Case design tokens — only in cases with a built page
    case.css               Case page styles, built only from the case's tokens
    cover.png              Cover (1600×1200 or 1920×1080 export from Figma)
    screens/*.png          Screen exports from Figma
```

Every case is self-contained: its own tokens, fonts and UI kit. Cases never import from each other; `portfolio/` styles only the shell.

## Add or update a case

1. Edit the case entry in `portfolio/cases.js` (`status`: `ready` · `wip` · `planned`; `cover`: path or `null`).
2. Put the cover at `cases/<slug>/cover.png` and set `cover: "cases/<slug>/cover.png"`.
3. For a full page, copy the pattern of `cases/03-visitready/` (tokens.css → case.css → index.html).

## Preview locally

```
python3 -m http.server 8000
```
Open http://localhost:8000.

All work is concept / self-initiated with synthetic data. No real patients, payers, EHR vendors or drug brands.
