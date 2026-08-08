# Change Log

## [Unreleased]

### Fixed
- Fixed a blank Visual view and unresponsive tabs caused by invalid JavaScript in the webview: `\n` escape sequences inside the client script were consumed by the surrounding template literal, producing a syntax error that aborted the entire inline script
- Added a regression test that verifies the generated webview script is syntactically valid JavaScript

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
