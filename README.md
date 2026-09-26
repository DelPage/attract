# Attract

A controller-first game library for Xbox Series X in Developer Mode. It shows
every system on the console, each system's games with box art and details, and
starts the chosen game in RetroArch. Quitting RetroArch returns to Attract.

## Parts

- `tools/library`: builds the library on a computer on the same network. It lists the console's ROM
  folders over Device Portal, matches each game to libretro artwork and
  metadata, adds encyclopedia descriptions, and writes `output/catalog.json`
  plus `output/media/`.
- `src/app`: the TV interface (TypeScript, no framework), bundled to `dist/`.
- `native/Attract`: the UWP host. WebView2 shows the interface, the host reads
  the controller, serves the library from `LocalState\library`, and launches
  RetroArch with `retroarch:?cmd=...&launchOnExit=attract:`.

## Commands

```bash
npm ci
npm test
npm run build                       # interface into dist/
npm run check:ui                    # drives the interface in Chrome, screenshots in output/screens
scripts/refresh-library.sh          # catalog, artwork and descriptions (needs XBOX_PORTAL in .env)
```

The Xbox package is built by the `Xbox package` GitHub workflow on a Windows
runner and signed with the private development certificate stored as
repository secrets.

## Delivering the library

Zip `output/catalog.json` and `output/media/` as `attract-library.zip`, upload
it to the app's `LocalState` folder with Device Portal, and launch Attract. It
unpacks the library on start and removes the zip.
