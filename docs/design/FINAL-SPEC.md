# Final design: Classic Enterprise, plus the Global Feed and QR certificates

The client reviewed five directions and chose this combination:

1. **The base is the clean design of direction 01 "Classic Enterprise" (HDX).** Reuse its exact visual
   vocabulary: tokens, type, nav, footer, buttons, verdict bands, tables, radii and spacing. Copy
   patterns from the source files rather than re-inventing them.
2. **Add the Global Feed from direction 03's Workstation**, restyled into Classic's language. It is a
   live, anonymised stream of verdicts worldwide.
3. **Add the QR certificate.** Every verdict can be issued as a Certificate of Classification with a
   unique QR code and verification code, downloadable as a PDF. **Customers can print the QR and put
   it on their products** (packaging, menus, food-truck windows, trays). Their own customers scan it
   to confirm that the product is a certified hot dog. This is the product's growth loop: every
   printed label advertises HDX and drives scans to a public verification page.

Format rules are unchanged. Follow `BRIEF.md` (same folder) to the letter: the `.dc.html` skeleton,
the hard rules, accessibility and the self-check. Where this spec differs from BRIEF.md about which
artboards exist, this spec wins.

## Source files to read first (read-only, do not modify)

All of these live in the canvas `project/` folder, whose path is in your prompt.
- `Classic-Landing.dc.html`, `Classic-Verdict.dc.html` and `Classic-Mobile.dc.html` are the base
  design. Copy their tokens and patterns.
- `Terminal-Verdict.dc.html` holds the GLOBAL FEED panel the client liked, at roughly lines
  300–360, with data at 430–520. Take the content and structure, not the amber/black look.
- `Counsel-Verdict.dc.html` holds the certificate and verification-block ideas. Again, take the
  content, not its look.

## Design tokens (from Classic, use exactly these)

- Navy ink and bands: `#0B1F3A`. Raised navy: `#13294B` and `#1E3A63`. Active nav: `#24395A`.
- Mustard accent: `#F2B705`. Use it only as a fill under navy text, or as text on navy. Never
  mustard text on white.
- Grounds: white `#FFFFFF` and section ground `#F3F5F8`. Hairlines: `#D9DEE5`.
- Text on white: body `#3F4A5A`, secondary labels `#5B6676`. Text on navy: `#B8C2D1`
  secondary, `#D5DCE6` sub-copy, `#FFFFFF` primary.
- Status green: `#1E7B4F`, for the live dot and the "Live" and "Valid" labels (5.2:1 on white).
- Fonts: "Source Serif 4" 600 for display headlines, verdict words and big numbers; "Source Sans 3"
  400/600/700 for UI and body; `ui-monospace, Menlo, Consolas, monospace` for codes and IDs.
  Google Fonts link:
  `https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@600&amp;family=Source+Sans+3:wght@400;600;700&amp;display=swap`
- Radii are 6 px for cards, buttons and inputs, and 4 px for chips. Use 1 px `#D9DEE5` borders and
  an 8 px spacing grid.
- HOT DOG verdict: a mustard `#F2B705` band or chip with navy text. NOT HOT DOG: a navy `#0B1F3A`
  band or chip with white text. The two differ strongly in lightness.

## Shared data (use these exact values everywhere so the boards tell one story)

- Brand: wordmark **HDX**, descriptor "Hot Dog or Not · Enterprise Cloud". Domain `hdx.example`.
  The public verification URL pattern is `hdx.example/v/<CODE>`.
- Workspace: "Ballpark Holdings — QA". User: Dana Kessler, Quality Lead.
- HOT DOG case: Case `HDX-2026-1024-7731`, `Oct 24, 2026 · 14:32:07.530 UTC`, confidence `99.2%`,
  `412 ms`, policy `Hot Dog Definition Policy v3.2, §2.1 — Canonical form`, file
  `frankfurter_lot14.jpg`, certificate `HDX-C-0088213`, verification code `7KQ2-M9XD`, verify URL
  `hdx.example/v/7KQ2-M9XD`.
- NOT HOT DOG case: Case `HDX-2026-1024-7732`, `14:32:07.556 UTC`, `98.7%`, `438 ms`, policy
  `v3.2, §3.5 — Flatbreads`, file `concourse_b_counter.jpg`, certificate `HDX-C-0088214`, code
  `4TPW-R8LC`, verify URL `hdx.example/v/4TPW-R8LC`.
- Certified product (for labels and the verify page): "Stadium Frank, 6 in." · SKU `BH-SF-06` ·
  issued to Ballpark Holdings · certificate `HDX-C-0088213` · code `7KQ2-M9XD` · issued
  `Oct 24, 2026` · status **Valid** · scanned `1,284` times · image fingerprint (SHA-256)
  `9f2c…e41a`.
- Model metadata (technical fields only): `claude-opus-5-5 · HDX policy engine 3.2.1`.
- Global feed: live rate `1,204 verdicts/s`. Regions: EU-C, US-E, AP-NE, US-C, EU-W, SA-E, US-W,
  AP-SE, EU-N, AF-S, AP-S. Rows are time `14:32:07`, region, verdict chip and confidence `99.2`.
  The first row is "This case" (14:32:07 · EU-C · HOT DOG · 99.2).
- Global totals today (example live values): `48,213,906` verdicts, `31.4%` hot dogs. Ambiguous
  verdicts issued, all time: `0`.

## Global Feed (Classic style)

- A white card with a 1 px `#D9DEE5` border and 6 px radius. The header row holds the serif title
  "Global feed" (or a section h2 on the landing page). On the right is a live indicator: an 8 px
  green `#1E7B4F` dot plus "Live · 1,204 verdicts/s" in `#1E7B4F` 600.
- A table header row (Time UTC · Region · Verdict · Confidence) in 12–13 px 600 `#5B6676`
  uppercase with letter-spacing. Rows are zebra `#F3F5F8`/`#FFFFFF` with 1 px `#D9DEE5`
  separators. Time uses tabular numerals in `#5B6676`, region is `#0B1F3A` 600, confidence is
  right-aligned with tabular numerals.
- Verdict chips: HOT DOG is mustard fill with navy 700 text; NOT HOT DOG is navy fill with white
  700 text. Both use 4 px radius, 12–13 px uppercase, about 24 px tall.
- The "This case" row gets a pale mustard tint background `#FDF3D0` plus a small "This case" tag
  (navy text). Do NOT use a coloured left border; that pattern is banned.
- A footnote under the feed: "Anonymised. The feed shows region, verdict and confidence only.
  Images never leave your workspace." Users of a serious product will ask this.
- Build the rows with `<sc-for>` over a `renderVals()` array, unless the rows sit inside a
  `<table>`. A browser moves custom elements out of tables, so either use a grid of divs or an
  `<ol>` of `<li>` rows with sc-for, or write table rows literally.

## QR certificate and printable labels

- The QR is drawn from the canonical SVG in `qr-snippet.svg.txt` (same folder). Paste that markup
  exactly, so every board shows the same code. You may change only its `width`/`height`, its
  `aria-label` (when the code differs) and the module fill colour. It is illustrative: the real
  product will generate a real scannable code.
- The certificate content is the case data above plus: issuer "HDX Classification Authority", the
  signature "Hot Dog Review Board" (role: Chief Classification Officer), a seal drawn in inline SVG
  (navy ring, mustard centre, "HDX · CERTIFIED"), the QR, the verification code and verify URL.
  Include the disclaimer "This certificate attests to the visual classification of the submitted
  image under Policy v3.2. It makes no claim about ingredients, nutrition or food safety."
- Actions wherever a certificate appears: **Download certificate (PDF)** (primary), **Print QR
  labels**, **Copy verification link**.
- The label message should be short, for example "Certified Hot Dog · Scan to verify ·
  hdx.example/v/7KQ2-M9XD". Put HDX branding on every label; that is the growth loop.

## Artboards in the final set (prefix `Final-`)

| File | Kind | Size |
|---|---|---|
| `Final-Landing.dc.html` | PAGE (fluid) | 1440 × est. height |
| `Final-Verdict.dc.html` | PAGE (fluid) | 1440 × est. height |
| `Final-Certificate.dc.html` | Print, fixed A4 portrait | 794 × 1123 |
| `Final-Labels.dc.html` | Print, fixed A4 portrait | 794 × 1123 |
| `Final-Mobile.dc.html` | Phone, fixed | 390 × 844 |
| `Final-Verify.dc.html` | Phone, fixed | 390 × 844 |

Print boards (fixed pages) follow these rules:
- Root fixed at exactly 794×1123 with overflow hidden; `$preview` is 794×1123.
- Keep at least 40 px clear inside every edge, and 72 px around running text.
- Nothing smaller than 12 px. No grey text lighter than `#767676`. Strokes of at least 1 px.
- Must read in grayscale. No huge dark floods. A navy letterhead band is fine, but keep the page
  mostly white.
- Write px and think in mm: 1 mm ≈ 3.78 px, so 60 mm = 227 px, 40 mm = 151 px, 25 mm = 94 px.
- No `vh`/`vw`. Everything must fit on the page, because whatever passes the edge is clipped.
