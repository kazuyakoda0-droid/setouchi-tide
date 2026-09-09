# しおどき — coastal print header system

Designed by GPT-6 Astra for GPT-5.6 Terra implementation. The approved Hiroshima prototype is the visual authority. This package is design assets and specification only; production templates are intentionally untouched.

## Composition

Use an off-white masthead, Japanese serif wordmark, thin vertical rule, then the approved indigo woodcut wave mark from `prototype/hiroshima/index.html`. Use the exact two-wave paths and subtle texture filter; replace the existing turquoise gradient mark everywhere. Preserve existing working search and navigation actions. Do not introduce a nonfunctional favorites control.

Desktop masthead: max-width 1380px, 96px tall, horizontal padding 32px. Brand Japanese 40px, English 14px, mark 58px. Header art spans the viewport below the masthead, 235px tall, background-size cover. Main content begins with breadcrumbs and the current page heading. Put no text over the art. There is no tagline, including no `瀬戸内の今日の海を知る`.

Mobile below 700px: masthead min-height 76px, 16px horizontal padding; Japanese brand 28px, English 14px, mark 42px, compact 12px gaps. Search/navigation remain at least 44px tap targets and 14px labels; allow a second navigation row if necessary at 320px. Art is 132px tall with center 55% crop. Do not hide core navigation. Main padding 16px. At 701–1000px art can be 190px tall.

## Routing and page families

The current data defines eight region routes. Provide nine geographic artworks by overriding Okinawa prefecture/stations within the combined Kyushu/Okinawa region. Do not add a new geographic route or change canonical URLs.

- Home: national artwork, existing home H1 and station discovery preserved.
- Region: matching region artwork, existing region H1 and prefecture lists preserved. Kyushu/Okinawa region uses kyushu.
- Prefecture: artwork from its `PREFS.region`, except Okinawa uses okinawa.
- Station today, explicit date, week and month: use station's prefecture mapping for all four views. Art is identical across time views; heading, date, tabs, data remain HTML below it.
- Guide index/detail, activity index/detail, about, privacy, 404: national artwork and existing page-specific heading/content.

Pass resolved art identity into shared page rendering; do not infer it from translated titles. Resolve with existing region/pref/station metadata. Use the asset/base-URL helper so subpath deployments work.

## Color and typography

Paper #f8f6ef, deeper paper #f0ede4, ink #073a67, secondary ink #456987, orange #ef612f, surface #fffefa. Dividers rgba(7,58,103,.24), subtle dividers rgba(7,58,103,.11). Use orange as small square marker and key accents, not long text. Body 18px with at least 1.65 line-height; captions/nav/secondary labels at least 14px. H1 Japanese serif, clamp(30px,4vw,46px). Body uses Yu Gothic/Hiragino/sans-serif. Numbers remain monospace where they aid data scanning.

Preserve all information and data semantics. Use thin rules and generous spacing instead of adding numerous boxed cards. Art is decorative: empty alt/aria-hidden is appropriate because headings already identify the place; never describe these stylized composites as actual observed conditions or a literal station view.

## Data readability

Transfer the approved prototype's uncluttered tide presentation to all time views. Keep high/low figures and units readable, especially mobile. Never scale a desktop SVG until its labels fall below 14 rendered pixels: use responsive viewBox/label rules or a horizontally scrollable chart with a meaningful min-width. Retain axis ticks, date/time controls, weather, source/approximation explanations, and all links. Tables may scroll horizontally rather than shrink typography. Validate at 375px and 1440px on home, region, pref, today, week, month and an information page.

## Files and generation

Production assets are in `public/assets/headers/`; `manifest.json` gives source paths, position and mapping. `index.html` is a static review sheet. Generated scenes are stylized geographic impressions, not cartographic or observational claims. Built-in image generation used the approved Setouchi print as a style reference; the complete prompt set is in `prompts.json`. Chugoku is the existing approved image reused unchanged. Deliver the compressed WebP files to production; retain source PNG files as design masters only if practical for repository size.
