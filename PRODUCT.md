# Crate — a personal listening library

## Product and scope
Build a small, finished web application for someone who collects albums and cares about visual culture. They want to browse what they own, choose what to listen to next, update listening status and retain personal notes. This is a collection tool, not an audio player or marketing site. No accounts, streaming, uploads, third-party APIs, recommendations or social features.

Keep scope comparable to a personal reading library: eight fictional albums, one SQLite entity, CRUD, search, status filter and notes. Use the simplest maintainable stack; no unnecessary framework, service or infrastructure.

## Visual ambition
The owner wants a premium, confident, contemporary application with taste and fluid interaction, not a merely correct CRUD screen. Make album art and the collection immediately useful in a normal laptop viewport. Choose an intentional composition, typography, density and interaction rhythm. The detail/edit experience, filtered results and mobile layout must feel as considered as the opening screen. Avoid a sparse hero above the real content, arbitrary decorative effects and identical generic admin cards.

No external design system is supplied. The configured Claude UI Designer chooses a coherent visual direction autonomously using the installed design skill and a small number of relevant inspected references. Compare two inexpensive composition sketches internally, select one and implement only it. No human chooser and no second app. Use native Design only if already available and authorized; otherwise deliver working components and inspect them in the browser without login delays.

Author eight credible fictional albums/artists and original abstract or typographic SVG cover artwork. Designer owns one shared visible-content fixture and album identities; Builder consumes it for seeds. No copyrighted cover copying or image-generation dependency. Create a minimal centralized token/component system, then all implementation follows it. Preserve a distinctive identity in both light and dark themes. Explain the chosen reference principles and concrete acceptance criteria concisely in the existing design artifact.

## Functional acceptance
- SQLite stores album title (required, max160), artist (required, max120), status (Want to hear / Listening / Heard), and optional notes (max4000). Count Unicode characters consistently and render notes as literal text.
- Create, view, edit and delete albums. Search title/artist, combined with a status filter. Change listening status directly from detail without entering the full editor.
- Seed the eight fictional records once; never reset user changes or re-seed a deliberately emptied collection on restart.
- Keep SQLite outside transient checkout/build output; data survives application restart.
- Pending mutations cannot duplicate work. Explain failures, preserve drafts and keep focus usable. Handle invalid input and stale/missing records safely.
- Accessible named controls, keyboard focus/return, touch targets, concise polite search/filter result announcements and reduced motion.
- Responsive desktop/tablet/phone, supported light/dark themes, no page overflow; realistic populated, filtered, empty, loading and error states.
- One-command local run plus a persistent unprivileged preview service, available after agents release.

## Delivery
Use the installed project-planning guidance and native workflow. Keep a visible backlog proportional to this small single-domain scope; no fixed task quota or technical-layer split. Implemented Designer foundations precede dependent integration. Builder owns the complete working feature including storage. Preserve independent Reviewer, Verifier and final Designer/Lead acceptance; no manual human gate.

One concise Current handoff per card carries revision, contract, evidence, remaining risks and next owner. Refresh plans when relevant events or changes require it, not as polling. Verifier owns the integrated visual matrix; Designer reuses exact-revision evidence and inspects unresolved questions. Recheck changed coverage without repeating accepted unchanged checks. Do not omit meaningful tests to meet a time target.

Publish accepted source to this public repository, excluding credentials, private infrastructure details, transcripts and runtime databases. Retain the app for inspection; deliver URL, exact revision, concise check results and representative final desktop/mobile screenshots in both themes. Be honest about limitations and actual native Design usage.
