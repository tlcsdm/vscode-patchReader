# Change Log

## [Unreleased]

### Changed
- Refactored the webview so the diff renderer runs from standalone static assets (`media/patchViewer.js` and `media/patchViewer.css`) loaded via `webview.asWebviewUri(...)`, instead of embedding the ~350‑line client script and CSS inside a TypeScript template literal. The browser now receives the script verbatim, eliminating the class of escaping bugs (`\n`, `</script>`, ...) that repeatedly broke the inline script.

### Fixed
- Fixed a blank Visual view and an unresponsive Content tab caused by the inline client script failing to run when the surrounding template literal mangled its escape sequences. The diff now renders and the tabs respond regardless of the patch contents.
- The initial patch content is passed to the webview through a non-executable JSON data block (with every `<` escaped as `\u003c`), so patches that contain `</script>` or HTML comments can no longer abort the viewer.

### Tests
- Replaced the inline-script validity test with checks that the shipped `media/patchViewer.js` parses as JavaScript and that the embedded initial content round-trips exactly (including `</script>` payloads).

## [1.0.2] - 2026-07-03

### Fixed
- Load bundled `diff2html` webview assets from `node_modules` when the copied `media` assets are unavailable during local development and testing

## [1.0.0] - 2026-01-30

### Added
- Initial release
- Custom editor for `.patch` and `.diff` files
- Two-tab interface: Visual diff view and raw content view
- diff2html integration for beautiful diff rendering
- Side-by-side and unified view modes
- Theme integration with VS Code (Light/Dark)
- Auto-render on content change
- Configuration option for default view mode
