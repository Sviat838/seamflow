# HDX design handover

This is the final design for **Hot Dog or Not — Enterprise Edition**, approved by the user on 2026-10-24. The live canvas is https://claude.ai/artifact/Udp5wQnfncV7nrv2ThdoNh. It is private to the user; the copies here are what you build from.

## Files

| File | What it is | Build as |
| --- | --- | --- |
| `boards/Main.dc.html` | Overview: tokens, type and the five product decisions | Reference only |
| `boards/Final-Landing.dc.html` | Marketing landing page | `/` |
| `boards/Final-Verdict.dc.html` | Result plus workspace shell, with the certificate and global feed in the right rail | Signed-in result page and app shell |
| `boards/Final-Mobile.dc.html` | Phone result after a camera capture | Responsive version of the result |
| `boards/Final-Verify.dc.html` | Public page a shopper reaches by scanning a QR label (valid / revoked) | `/v/[code]` |
| `boards/Final-Certificate.dc.html` | A4 Certificate of Classification | PDF download |
| `boards/Final-Labels.dc.html` | A4 sheet of QR labels at 60, 40 and 25 mm | Printable page or PDF |
| `FINAL-SPEC.md` | Tokens, shared copy and data, and the Global Feed and certificate specs | Reference |
| `use-cases.json` | Researched business and consumer use cases, plus the website copy for the use-cases section | Landing copy |

The `.dc.html` files are design mockups. They use inline styles plus a small `x-dc` templating runtime (`{{holes}}`, `<sc-if>`, `<sc-for>`). Open them in a text editor for exact copy, colours, spacing and structure, then rebuild them as React components with Tailwind. Don't paste their markup into the app.

## Design tokens

- Navy `#0B1F3A` is used for ink, bands and the NOT HOT DOG verdict. Raised navy is `#13294B` or `#1E3A63`, with `#24395A` for borders on navy.
- Mustard `#F2B705` is used for the primary action and the HOT DOG verdict. Put it behind navy text or use it as text on navy, never as text on white.
- Grounds are white and `#F3F5F8`, with hairlines `#D9DEE5`.
- Body text is `#3F4A5A` and secondary text is `#5B6676`. On navy, use `#B8C2D1` and `#D5DCE6`.
- Status green is `#1E7B4F`.
- Fonts: Source Serif 4 at weight 600 for display text, Source Sans 3 at 400/600/700 for UI, and the system monospace for codes.
- Radii are 6 px for cards and buttons and 4 px for chips, on an 8 px spacing grid.
- Avoid gradients, emoji and coloured left borders. Text contrast must be at least 4.5:1, and touch targets at least 44 px.

## Product decisions

1. **Upload first.** No signup is needed, and the first 20 classifications are free in total (not per month).
2. **The verdict is binary.** HOT DOG or NOT HOT DOG, with confidence, reasoning and the policy clause that decided it (Hot Dog Definition Policy v3.2). Users can appeal to the "Hot Dog Review Board".
3. **Live global feed.** It is anonymised: time, region, verdict and confidence only, never images or company names.
4. **QR certificates.**
   - Every verdict can be issued as a Certificate of Classification PDF with a real QR code and a verification code.
   - Businesses print QR labels for packaging, menus and trays, and shoppers scan them to reach `/v/[code]`.
   - A certificate can be revoked after an appeal.
   - Every certificate, label and verify page carries this disclaimer: *visual classification only, with no claim about ingredients, nutrition or food safety*.
5. **Plans.** Free gives 20 classifications. Business is a paid plan with the API included and pricing agreed per customer through **Contact us**. No prices appear anywhere.
6. **Companies** (added by the user on 2026-10-24).
   - **Registration asks for the company name, and the account is tied to that company.**
   - **A separate public page ranks companies by the rating of their hot dogs.**
   - **The user confirmed this rating definition on 2026-10-24.** The verdict stays binary. For HOT DOG verdicts only, the classifier also returns an **HDX Rating from 0 to 100**: how canonical a hot dog it is under Policy v3.2 (bun, sausage, condiments, presentation), with a short note.
   - **A company's rating** is the Bayesian-smoothed average of its HOT DOG ratings, so one lucky photo can't top the table. The page shows it with certified hot dogs, total classifications, hot-dog share and last activity.
   - **A profile page** lists each company's certified products and their ratings.
