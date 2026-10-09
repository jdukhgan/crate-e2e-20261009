# Crate

A personal listening library: browse albums, track listening status, and keep notes. The cover wall and detail editor work in light/dark themes and on phones, tablets and desktops. See [PRODUCT.md](PRODUCT.md) for scope and [docs/design.md](docs/design.md) for the visual and interaction contract.

Run with **Node 24.14 or newer**:

```sh
npm start
```

Open `http://localhost:4317`. No dependency installation or build step is needed. `npm test` runs real HTTP/SQLite tests, including validation, CRUD, failures, restart persistence and deliberately emptying the collection. Node 24 currently emits an experimental warning for its built-in SQLite module.

The database defaults to `$XDG_DATA_HOME/crate/crate.sqlite`, or `~/.local/share/crate/crate.sqlite`. It is outside the checkout and is seeded only once from the eight fictional albums in `fixtures/albums.json`. Deleting all albums keeps the collection empty on restart. Back up the retained data directory with the app stopped, including any SQLite sidecar files. Never commit it.

Configuration: `PORT` (default `4317`), `HOST` (default `127.0.0.1`), and `CRATE_DATA_DIR` (absolute retained data directory). This is a single-user app without accounts; run it on your own machine or a trusted development network.

## Persistent preview

The project preview uses the enabled, non-transient user unit `jlab-preview-crate-e2e-20261009.service`. Its retained source is the `feature/crate-library` isolated worktree; data is under `~/.local/share/crate-e2e-20261009/crate.sqlite`; port `4317`, health path `/health`. Exact checkout, revision and worker URL are recorded in the task's Current handoff rather than public source. User lingering must be enabled by the environment owner.

```sh
systemctl --user start jlab-preview-crate-e2e-20261009.service
systemctl --user restart jlab-preview-crate-e2e-20261009.service
systemctl --user stop jlab-preview-crate-e2e-20261009.service
systemctl --user show jlab-preview-crate-e2e-20261009.service \
  --property=ActiveState,MainPID,Transient,UnitFileState
```

To create an equivalent preview, put this unit in `~/.config/systemd/user/`, substituting your retained checkout, absolute Node path and data directory, then run `systemctl --user daemon-reload` and `systemctl --user enable --now jlab-preview-crate-e2e-20261009.service`:

```ini
[Unit]
Description=Crate project development preview
[Service]
WorkingDirectory=<retained-checkout>
ExecStart=<absolute-node-path> server/main.js
Environment=PORT=4317
Environment=HOST=0.0.0.0
Environment=CRATE_DATA_DIR=<retained-data-directory>
Restart=on-failure
RestartSec=2s
[Install]
WantedBy=default.target
```

## API

`GET /api/albums?q=&status=` searches title/artist and optionally combines a status filter. Status values are `want_to_hear`, `listening`, `heard`. `POST /api/albums` creates an album; `GET`, `PATCH` and `DELETE /api/albums/:id` operate on one album. JSON input supports title, artist, status and notes; cover is managed by the shared fixture. PATCH supports a status-only change. Limits count Unicode code points: title 160, artist 120, notes 4000. Title/artist are trimmed, notes remain literal. Errors have `{error:{code,message,fields?}}`; invalid input is 400, missing records 404 and retryable server errors 500. The browser shares the server's validation contract.

The design-only mock reference is excluded from the application server. Final independent functional verification and Designer visual acceptance belong to the delivery workflow.
