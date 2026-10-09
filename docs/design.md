# Crate design foundation

Owner: UI Designer. This is the visual authority for Crate. Builder integrates against these files instead of restyling them. Ask the Designer for missing primitives.

## Direction

**Who and where.** One collector of albums and visual culture, at home, choosing what to play next and keeping notes. Album art is how they recognise a record, so art leads and text supports it.

**Character.** A record-shop and sleeve-design world: warm paper and ink, with one cadmium accent of the kind used on record labels. It is confident and editorial, but it still behaves like a tool. Light theme for daytime browsing, a warm charcoal for late listening. Both themes keep the same accent and hierarchy.

**Reference principles.** These are principles taken from the category, not copied screens:
- Music-library apps (Apple Music / Roon album grids): a cover-first grid with title and artist beneath, and selection opening details without leaving the collection.
- Mail and notes apps (list/detail): a persistent detail pane on wide screens and a full sheet on small screens. Editing happens in place, without a modal.
- Record sleeves and Swiss-style label typography: a characterful grotesque for titles and a neutral text face for everything else.

**Compositions compared.**
- A: cover wall with a persistent detail pane.
- B: shelf list rows with thumbnails and rows that expand.

**Chosen: A.** The whole collection is visible at 1366×768, and status and notes are one click away. B made the art into thumbnails and read like an admin table.

**Attention order.**
1. The covers.
2. The selected record's title and status.
3. Notes and actions.

The main action is **Add album**, which sits in the top bar.

**Signature move.** When an album is selected, its record slides out of the sleeve in the detail pane. The disc label is the album's own art. The slide uses one 620 ms ease-out with a translate and a slight rotation. With `prefers-reduced-motion` the disc sits at rest with no transition.

## Files

| Path | What |
|---|---|
| `public/styles/tokens.css` | All colour, type, space, radius, shadow and motion tokens, both themes, and the self-hosted `@font-face` rules |
| `public/styles/components.css` | Every component style and the responsive layout. Uses only token values |
| `public/js/contract.js` | Shared limits, status enum/labels, `countChars` (code points) and `validateAlbumInput`. **Import on the server too** |
| `public/js/components.js` | DOM primitives: `button`, `setPending`, `cover` (with typographic fallback), `statusMark`, `statusSwitch`, `albumTile`, `skeletonTiles`, `sleeve`/`playSleeve`, `inlineAlert`, `emptyState`, `createToaster`, `createAnnouncer`, `textField`, `albumEditor` |
| `public/js/library-view.js` | `mountLibrary(root, { store })`: the whole screen with search/filter, wall, pane, editor, delete confirmation, focus rules and announcements |
| `public/js/theme.js` | Theme toggle; saved choice in `localStorage['crate-theme']`, otherwise the OS preference |
| `public/fonts/` | Bricolage Grotesque and Inter variable fonts (latin and latin-ext, OFL; licences included) |
| `public/covers/*.svg` | Eight original covers (abstract shapes only, no text or copied art) |
| `public/favicon.svg` | Crate mark |
| `fixtures/albums.json` | **The** shared visible-content fixture: eight fictional albums with stable IDs. Builder seeds from it once |
| `public/design/reference.html`, `mock-store.js` | Browser reference that runs the real components against an in-memory store. Builder can exclude these from production |
| `scripts/design-preview.mjs` | `node scripts/design-preview.mjs [port]` serves `public/` at `/` and `fixtures/` at `/fixtures/` |
| `docs/reference/*.png` | Representative captures (1366×768 laptop and 390×844 phone, light and dark) |

## Builder integration

1. Serve `public/` at `/`, so covers resolve as `/covers/<name>.svg`.
2. Create `index.html` from `public/design/reference.html`: same head (theme boot script, font preloads, stylesheets, favicon), with the mock replaced by a fetch-backed store.
3. The store implements `list({ q })`, `create(input)`, `update(id, patch)` and `remove(id)`. On failure it rejects with an `Error` that carries `status`, `code`, and `fields` for a 400. `list` returns every status that matches `q`. The view filters by status on the client, so all filter counts come from one request. The API's `status` parameter stays part of the contract for direct use and tests.
4. `cover` may be `null` for albums the user adds. The UI then draws a typographic sleeve whose hue comes from the id.
5. `update(id, { status })` is used by the direct status change; the editor sends all fields.

## Interaction contract (implemented in `library-view.js`)

- **Validation:** client-side through `validateAlbumInput` before the request. Errors appear on the fields, and focus goes to the first invalid field. Server `fields` on a 400 are shown the same way.
- **Pending:** the submit button switches to "Saving…"/"Adding…"/"Deleting…" with a spinner and `aria-disabled="true"`. It keeps focus and ignores repeat activation. Cancel and Escape are ignored while a request is pending. The status switch is `aria-busy`, and its target option pulses with a "Saving…" caption.
- **Failure (5xx or network):** the controls unlock first. Then a `role="alert"` message appears that names the problem and the recovery, with **Try again**, and receives focus. The editor draft is kept as typed. A failed status change reverts the selection and shows an inline retry.
- **Stale or missing (404):** the collection is refreshed, the pane closes, a toast and a polite announcement explain what happened, and focus moves to the nearest surviving album (next, then previous). If none survives, focus goes to the collection heading.
- **Delete:** an inline confirmation in the pane, not a modal. After deletion focus goes to the next album, then the previous one. If the collection is empty, focus goes to **Add album**.
- **Focus return:** closing the sheet returns focus to the tile that opened it. Saving an edit returns focus to **Edit**, and cancelling does the same. After a create, focus goes to the new tile, or the detail title when the tile is not visible. Cancelling a create returns focus to its opener.
- **Announcements:** one polite live region, used for result counts after search or filter changes ("3 albums in Heard matching “o”", "No albums matching “zzz”") and for mutation outcomes. Toasts are visual only.
- **Notes:** rendered with `textContent` and `white-space: pre-wrap`, so they display literally.

## Layout and acceptance criteria

- **≥960 px:** a sticky top bar with search in the centre. The wall (`auto-fill`, 156 px minimum, 144 below 1280) sits beside a sticky pane of 360–440 px. At 1366×768 all eight albums are visible above the fold, and the first album is selected so the pane is never empty.
- **<960 px:** the pane becomes a modal sheet (`role="dialog"`, `aria-modal`, the rest of the page `inert`). It has a **Back to collection** control and closes with Escape or a click on the scrim. Below 640 px it fills the screen.
- **<640 px:** the top bar wraps (brand and actions, then full-width search). Filters become a scrollable row of pills, and the wall has two columns.
- No horizontal page overflow at 390, 820, 1366 or 1440 px (checked in the reference).
- Text contrast is at least 4.5:1 for every text token pair in both themes. Measured: faint text 5.27 light / 6.55 dark; accent button 5.16 / 6.74; status colours 5.76 or higher.
- Touch targets are at least 44 px (filter pills 38 px inside a 44 px track). Every control is a native button, input or radio with a visible focus ring in `--focus`.
- States: loading uses skeleton tiles; an empty collection shows "Your crate is empty" with **Add album**; a filtered or searched empty result explains itself and offers **Clear search and filter**; a list-load failure offers **Reload collection**.
- Reduced motion: the disc slide, hover lift, sheet slide-in and toast entrance are removed, and loading pulses slow down.

## Reference states

Open `node scripts/design-preview.mjs`, then `/design/reference.html` with these query parameters:

| Parameter | Effect |
|---|---|
| `theme=light\|dark` | Choose the theme |
| `empty=1` | Start with an empty collection |
| `fail=list,save,status,delete` | Make each named call fail once with a 500 |
| `gone=1` | Make the next mutation return 404 |
| `latency=ms` | Simulated latency |
