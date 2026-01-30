# Patch Reader

A VS Code extension for visualizing patch and diff files using diff2html.

## Features

- 📄 Open `.patch` or `.diff` files with visual diff rendering
- 🔄 Two-tab editor: Visual diff view and raw content view
- 📐 Side-by-side and unified view modes
- 🎨 Theme integration - automatically follows VS Code's color theme (Light/Dark)
- ✏️ Auto-render when file content changes
- 🔧 Configurable default view mode

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Tlcsdm Patch Reader"
4. Click Install

### From VSIX file

1. Download the latest `.vsix` file from [Releases](https://github.com/tlcsdm/vscode-patchReader/releases)
2. Open VS Code
3. Go to Extensions (Ctrl+Shift+X)
4. Click the `...` menu and select "Install from VSIX..."
5. Select the downloaded `.vsix` file

## Usage

1. Open any `.patch` or `.diff` file in VS Code
2. The file will automatically open in the Patch Reader editor
3. Use the tabs to switch between:
   - **Visual Diff**: Rendered diff using diff2html
   - **Raw Content**: Original file content
4. Use the view mode buttons to switch between:
   - **Side-by-Side**: Two-column diff view
   - **Unified**: Single-column diff view

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `tlcsdm.patchReader.defaultViewMode` | Default view mode for diff visualization | `side-by-side` |

## Screenshots

### Side-by-Side View (Light Theme)
![Side-by-Side Light](images/side-by-side-light.png)

### Unified View (Dark Theme)
![Unified Dark](images/unified-dark.png)

## Development

### Prerequisites

- Node.js 22.x or later
- npm

### Setup

```bash
# Clone the repository
git clone https://github.com/tlcsdm/vscode-patchReader.git
cd vscode-patchReader

# Install dependencies
npm install

# Compile
npm run compile

# Watch for changes
npm run watch

# Run tests
npm run test

# Package extension
npx @vscode/vsce package
```

### Project Structure

```
vscode-patchReader/
├── .github/              # GitHub configuration (workflows, dependabot, etc.)
├── .vscode/              # VS Code development configuration
├── images/               # Extension icon and screenshots
├── media/                # Webview assets (CSS, JS)
├── src/
│   ├── extension.ts      # Extension entry point
│   ├── patchEditorProvider.ts  # Custom editor provider
│   └── test/             # Test files
├── package.json          # Extension manifest
├── tsconfig.json         # TypeScript configuration
└── README.md
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Credits

- [diff2html](https://github.com/rtfpessoa/diff2html) - Beautiful diff visualization library
