# SHIVASS PACK — Design System (V1)

## 1. Direction

**Premium launcher, not arcade.** Reference feel: modern PC game launcher + professional
software dashboard (Epic / Steam Deck UI discipline), never a 2008 forum or an RGB
keyboard ad.

Hard rules:
- Dark by default (`:root` dark, light theme available via class).
- **One accent color.** Everything else is neutral gray scale.
- No neon glow spam, no rainbow gradients, no oversized toy buttons.
- Depth comes from **surface steps + 1px borders + subtle shadows**, not from blur soup.
- Typography, spacing and hierarchy do the "premium" work — not effects.

## 2. Color tokens

CSS variables in `globals.css` (Tailwind v4 `@theme` mapping). Accent = **Ember**
(brand: heat / Şiv-aş), a warm orange-red that reads as "FiveM / GTA" without being
clownish.

```
--background:        oklch(0.145 0.010 265)     /* page */
--surface-1:         oklch(0.175 0.011 265)     /* cards */
--surface-2:         oklch(0.205 0.012 265)     /* hover / raised */
--border:            oklch(0.260 0.012 265)     /* hairlines */
--border-strong:     oklch(0.330 0.014 265)

--foreground:        oklch(0.960 0.004 265)     /* primary text */
--muted-foreground:  oklch(0.680 0.010 265)     /* secondary text */
--subtle-foreground: oklch(0.520 0.010 265)     /* tertiary / meta */

--accent:            oklch(0.660 0.190 32)      /* #F4551E-ish ember */
--accent-hover:      oklch(0.710 0.190 32)
--accent-soft:       oklch(0.660 0.190 32 / 0.14)
--on-accent:         oklch(0.16 0.02 32)

--success: oklch(0.68 0.14 155)   --warning: oklch(0.76 0.15 85)
--danger:  oklch(0.62 0.19 25)    --info:    oklch(0.70 0.12 230)
```

Rules:
- Accent used for: primary CTA, active nav, focus ring, rating stars, key stats.
- Accent never used for: long text, large backgrounds, every icon.
- Semantic colors (success/danger) only for state, never decoration.

## 3. Typography

| Role | Stack | Notes |
|---|---|---|
| Display | `Space Grotesk` | hero, section titles, uppercase + tight tracking |
| Body/UI | `Inter` | everything else |
| Mono | `JetBrains Mono` | code, paths, manifests, version strings |

Scale (rem): `12 · 13 · 14 · 16 · 18 · 22 · 28 · 40 · 56`
- Headings: `-0.02em` tracking, `1.1` line-height.
- Section eyebrow labels: 12px, `0.16em` tracking, uppercase, muted — used above
  section titles (`TRENDING PACKS`) for the launcher feel.
- Never center long paragraphs.

Fonts self-hosted (next/font) — no Google Fonts CDN at runtime.

## 4. Spacing & layout

- 4px base grid; use Tailwind's spacing scale only.
- Container: `max-w-7xl`, gutters `20/24/32px` by breakpoint.
- Section vertical rhythm: `py-16 md:py-24`.
- Card radius: `12px`; controls `8px`; badges `999px`.
- Border: `1px solid var(--border)` — the primary separation device.

## 5. Depth & motion

- Card hover: `translateY(-2px)` + border → `--border-strong` + surface step.
- Page transitions: none (keep navigation instant).
- Entrance: `opacity/translate-y` 240ms, stagger 40ms, **once per session**,
  disabled under `prefers-reduced-motion`.
- Hover media zoom: `scale(1.04)` 400ms ease-out inside `overflow-hidden`.
- Skeletons on every async list (no layout shift).
- Motion budget: expressive-moments only — hero and cards, nothing continuous.

## 6. Components (shadcn-based, adapted)

Primitives: `Button`, `Input`, `Textarea`, `Select`, `Dialog`, `Sheet`, `Dropdown`,
`Tooltip`, `Tabs`, `Avatar`, `Badge`, `Skeleton`, `Toast`, `Popover`, `Command` (⌘K).

Domain components:
`PackCard`, `PackHero`, `CategoryCard`, `RatingStars`, `PerformanceBadge`,
`VersionBadge`, `CreatorBadge`, `DownloadButton`, `InstallButton`, `FilterPanel`,
`SearchModal`, `NewsCard`, `ForumTopicCard`, `StatsCard`, `UserAvatar`,
`EmptyState`, `SectionHeader`, `Breadcrumbs`.

Button variants: `primary` (accent), `secondary` (surface-2 + border), `ghost`,
`outline`, `danger`. Sizes `sm/md/lg`. Only one primary button per view region.

## 7. Iconography

Lucide, 16/18/20px, stroke `1.75`. Never icon-only without `aria-label`.
Category icons stay single-color; no emoji in UI chrome.

## 8. Layout anatomy (homepage)

```
Navbar (sticky, blurred, 64px)
  Logo · Graphics · PvP · ReShade · ENB · Community · Forum · News
  ··· Search (⌘K) · Login/Avatar
Hero (min-h 78vh, subtle grid/gradient art, no video)
  wordmark · one-line slogan · search · [EXPLOR E PACKS] [QUICK INSTALL]
Featured pack (single large editorial card)
Categories (4 cards: cover + count + 3 previews)
Trending Packs (grid, algorithmic + admin override)
Top Rated Community Packs
Known Packs / Popular Ecosystem (metadata-only friendly)
Latest News (3–6 cards)
Community Discussions (trending / latest / most replied tabs)
Discord CTA (compact band, admin-configurable)
Footer (links, socials, legal, status)
```

## 9. Responsive

- Desktop ≥1280: 4-col pack grids, sidebar filters.
- Laptop 1024: 3-col, collapsible filters.
- Tablet 768: 2-col, sheet-based filters, hamburger nav.
- Mobile ≤648: single column, bottom-safe padding, 44px min tap targets,
  horizontal scroll for tag rows only.
- Mobile is designed, not scaled down: hero art recomposed, CTAs full-width,
  cards become media-first list items where dense.

## 10. Accessibility

- WCAG AA contrast (accent on dark checked: text uses `--on-accent` on accent fills).
- Visible focus ring: `2px accent outline + 2px offset` on every interactive element.
- Landmarks: `header/nav/main/footer`, one `h1` per page.
- All modals: focus trap, Esc, restored focus, `aria-modal`.
- Ratings/likes announce via `aria-live`.
- Keyboard: full nav, ⌘K palette, skip-to-content link.

## 11. Empty / edge states

Every list has: `loading` (skeleton), `empty` (icon + copy + action), `error`
(retry), `unauthorized`, `maintenance`, `404`, `403`, `500` — designed once in
`EmptyState` + `error.tsx` / `not-found.tsx`.

## 12. Brand assets

- Wordmark: `SHIVASS PACK` set in Space Grotesk 700, `PACK` in accent, small
  ember-square mark before it. Rendered by `<Logo />` component (admin-swappable).
- Favicon: ember square with cut corner.
- Social/OG default: dark surface, wordmark, one line tagline.
