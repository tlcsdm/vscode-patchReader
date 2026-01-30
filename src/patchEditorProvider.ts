import * as vscode from 'vscode';

/**
 * Custom editor provider for patch/diff files
 */
export class PatchEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'tlcsdm.patchReader.editor';
    
    private activeWebviewPanel: vscode.WebviewPanel | undefined;
    private currentViewMode: 'side-by-side' | 'unified' = 'side-by-side';
    private static outputChannel: vscode.OutputChannel | undefined;

    constructor(private readonly context: vscode.ExtensionContext) {
        // Get default view mode from configuration
        const config = vscode.workspace.getConfiguration('tlcsdm.patchReader');
        this.currentViewMode = config.get<'side-by-side' | 'unified'>('defaultViewMode', 'side-by-side');
        
        // Create output channel for logging
        if (!PatchEditorProvider.outputChannel) {
            PatchEditorProvider.outputChannel = vscode.window.createOutputChannel('Patch Reader');
        }
    }
    
    /**
     * Log error message to output channel
     */
    private logError(message: string, error?: unknown): void {
        const timestamp = new Date().toISOString();
        const errorMessage = error instanceof Error ? error.message : String(error || '');
        const logMessage = errorMessage ? `[${timestamp}] ERROR: ${message} - ${errorMessage}` : `[${timestamp}] ERROR: ${message}`;
        PatchEditorProvider.outputChannel?.appendLine(logMessage);
        PatchEditorProvider.outputChannel?.show();
    }

    /**
     * Toggle between side-by-side and unified view modes
     */
    public toggleViewMode(): void {
        if (!this.activeWebviewPanel) {
            vscode.window.showInformationMessage('Please open a patch or diff file to toggle view mode');
            return;
        }
        this.currentViewMode = this.currentViewMode === 'side-by-side' ? 'unified' : 'side-by-side';
        this.activeWebviewPanel.webview.postMessage({
            type: 'setViewMode',
            viewMode: this.currentViewMode
        });
    }

    /**
     * Called when a custom editor is opened
     */
    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _token: vscode.CancellationToken
    ): Promise<void> {
        this.activeWebviewPanel = webviewPanel;

        // Setup webview options
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'media')
            ]
        };

        // Get URIs for diff2html resources from media folder
        const diff2htmlCssUri = webviewPanel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'diff2html', 'css', 'diff2html.min.css')
        );
        const diff2htmlJsUri = webviewPanel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'diff2html', 'js', 'diff2html.min.js')
        );

        // Set initial HTML content
        webviewPanel.webview.html = this.getHtmlForWebview(
            webviewPanel.webview,
            document.getText(),
            diff2htmlCssUri,
            diff2htmlJsUri
        );

        // Handle messages from the webview
        webviewPanel.webview.onDidReceiveMessage(async message => {
            switch (message.type) {
                case 'viewModeChanged':
                    this.currentViewMode = message.viewMode;
                    break;
                case 'error':
                    this.logError(message.message, message.error);
                    break;
                case 'contentChanged': {
                    // Apply edits from the webview to the document
                    const edit = new vscode.WorkspaceEdit();
                    edit.replace(
                        document.uri,
                        new vscode.Range(0, 0, document.lineCount, 0),
                        message.content
                    );
                    await vscode.workspace.applyEdit(edit);
                    break;
                }
            }
        });

        // Handle document changes
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                webviewPanel.webview.postMessage({
                    type: 'update',
                    content: document.getText()
                });
            }
        });

        // Handle theme changes
        const themeChangeSubscription = vscode.window.onDidChangeActiveColorTheme(theme => {
            webviewPanel.webview.postMessage({
                type: 'themeChanged',
                kind: theme.kind
            });
        });

        // Clean up when the webview is disposed
        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
            themeChangeSubscription.dispose();
            if (this.activeWebviewPanel === webviewPanel) {
                this.activeWebviewPanel = undefined;
            }
        });

        // Send initial theme
        webviewPanel.webview.postMessage({
            type: 'themeChanged',
            kind: vscode.window.activeColorTheme.kind
        });

        // Send initial view mode
        webviewPanel.webview.postMessage({
            type: 'setViewMode',
            viewMode: this.currentViewMode
        });
    }

    /**
     * Get the HTML content for the webview
     */
    private getHtmlForWebview(
        webview: vscode.Webview,
        content: string,
        diff2htmlCssUri: vscode.Uri,
        diff2htmlJsUri: vscode.Uri
    ): string {
        const nonce = getNonce();

        return /* html */`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <link href="${diff2htmlCssUri}" rel="stylesheet">
    <title>Patch Reader</title>
    <style>
        :root {
            --bg-primary: var(--vscode-editor-background);
            --bg-secondary: var(--vscode-sideBar-background, var(--vscode-editor-background));
            --text-primary: var(--vscode-editor-foreground);
            --text-muted: var(--vscode-descriptionForeground);
            --border-color: var(--vscode-panel-border, var(--vscode-editorGroup-border));
            --btn-bg: var(--vscode-button-secondaryBackground);
            --btn-bg-hover: var(--vscode-button-secondaryHoverBackground);
            --btn-text: var(--vscode-button-secondaryForeground);
            --btn-primary-bg: var(--vscode-button-background);
            --btn-primary-bg-hover: var(--vscode-button-hoverBackground);
            --btn-primary-text: var(--vscode-button-foreground);
            --tab-active-bg: var(--vscode-tab-activeBackground);
            --tab-inactive-bg: var(--vscode-tab-inactiveBackground);
            --tab-active-fg: var(--vscode-tab-activeForeground);
            --tab-inactive-fg: var(--vscode-tab-inactiveForeground);
            --tab-border: var(--vscode-tab-border);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            background-color: var(--bg-primary);
            color: var(--text-primary);
            height: 100vh;
            overflow: hidden;
        }

        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 16px;
            background-color: var(--bg-secondary);
            border-top: 1px solid var(--border-color);
            order: 1;
        }

        .tabs {
            display: flex;
            gap: 0;
        }

        .tab {
            padding: 8px 16px;
            border: none;
            background-color: var(--tab-inactive-bg);
            color: var(--tab-inactive-fg);
            cursor: pointer;
            font-size: 13px;
            border-top: 2px solid transparent;
            transition: all 0.2s ease;
        }

        .tab:hover {
            background-color: var(--tab-active-bg);
        }

        .tab.active {
            background-color: var(--tab-active-bg);
            color: var(--tab-active-fg);
            border-top-color: var(--btn-primary-bg);
        }

        .view-toggle {
            display: flex;
            gap: 4px;
        }

        .view-btn {
            padding: 6px 12px;
            border: 1px solid var(--border-color);
            background-color: var(--btn-bg);
            color: var(--btn-text);
            cursor: pointer;
            font-size: 12px;
            border-radius: 4px;
            transition: all 0.2s ease;
        }

        .view-btn:hover {
            background-color: var(--btn-bg-hover);
        }

        .view-btn.active {
            background-color: var(--btn-primary-bg);
            color: var(--btn-primary-text);
            border-color: var(--btn-primary-bg);
        }

        .content {
            flex: 1;
            overflow: auto;
            padding: 16px;
            min-height: 0;
        }

        .tab-content {
            display: none;
            height: 100%;
            overflow: hidden;
        }

        .tab-content.active {
            display: block;
        }

        #diff-output {
            overflow: auto;
            height: 100%;
        }

        #content-output {
            width: 100%;
            height: 100%;
            overflow: auto;
            padding: 8px 12px;
            margin: 0;
            font-family: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace);
            font-size: var(--vscode-editor-font-size, 14px);
            line-height: var(--vscode-editor-line-height, 1.5);
            background-color: var(--bg-primary);
            color: var(--text-primary);
            border: none;
            white-space: pre;
            tab-size: 4;
            resize: none;
            outline: none;
        }

        /* Diff syntax highlighting - matching VS Code built-in editor */
        .diff-line-header {
            color: var(--vscode-diffEditor-unchangedRegionForeground, #608b4e);
        }
        .diff-line-add {
            color: var(--vscode-gitDecoration-addedResourceForeground, #89d185);
            background-color: var(--vscode-diffEditor-insertedLineBackground, rgba(155, 185, 85, 0.2));
        }
        .diff-line-delete {
            color: var(--vscode-gitDecoration-deletedResourceForeground, #f14c4c);
            background-color: var(--vscode-diffEditor-removedLineBackground, rgba(255, 0, 0, 0.2));
        }
        .diff-line-meta {
            color: var(--vscode-symbolIcon-functionForeground, #569cd6);
        }
        .diff-line-range {
            color: var(--vscode-editorLineNumber-activeForeground, #c586c0);
        }
        .diff-line-index {
            color: var(--vscode-textPreformat-foreground, #9cdcfe);
        }

        /* Light theme overrides */
        body.vscode-light .diff-line-header {
            color: #22863a;
        }
        body.vscode-light .diff-line-add {
            color: #22863a;
            background-color: rgba(46, 160, 67, 0.15);
        }
        body.vscode-light .diff-line-delete {
            color: #cb2431;
            background-color: rgba(248, 81, 73, 0.15);
        }
        body.vscode-light .diff-line-meta {
            color: #0550ae;
        }
        body.vscode-light .diff-line-range {
            color: #6f42c1;
        }
        body.vscode-light .diff-line-index {
            color: #953800;
        }

        .placeholder {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--text-muted);
        }

        /* diff2html theme overrides for VS Code integration */
        .d2h-wrapper {
            font-family: var(--vscode-editor-font-family, monospace);
        }

        .d2h-file-header {
            background-color: var(--bg-secondary);
            border-color: var(--border-color);
        }

        .d2h-file-name {
            color: var(--text-primary);
        }

        .d2h-file-wrapper {
            border-color: var(--border-color);
        }

        /* Light theme diff colors */
        body.vscode-light .d2h-del {
            background-color: #ffeef0;
        }

        body.vscode-light .d2h-ins {
            background-color: #e6ffec;
        }

        body.vscode-light .d2h-info {
            background-color: #f1f8ff;
            color: #0366d6;
        }

        body.vscode-light .d2h-code-line-ctn,
        body.vscode-light .d2h-code-side-line {
            background-color: var(--bg-primary);
            color: var(--text-primary);
        }

        body.vscode-light .d2h-code-linenumber,
        body.vscode-light .d2h-code-side-linenumber {
            background-color: var(--bg-secondary);
            color: var(--text-muted);
            border-color: var(--border-color);
        }

        body.vscode-light .d2h-del .d2h-code-line-ctn,
        body.vscode-light .d2h-del .d2h-code-side-line {
            background-color: #ffeef0;
        }

        body.vscode-light .d2h-ins .d2h-code-line-ctn,
        body.vscode-light .d2h-ins .d2h-code-side-line {
            background-color: #e6ffec;
        }

        /* Dark theme diff colors */
        body.vscode-dark .d2h-del,
        body.vscode-high-contrast .d2h-del {
            background-color: #3d1d26;
        }

        body.vscode-dark .d2h-ins,
        body.vscode-high-contrast .d2h-ins {
            background-color: #1f3d2a;
        }

        body.vscode-dark .d2h-info,
        body.vscode-high-contrast .d2h-info {
            background-color: #1f2937;
            color: #93c5fd;
            border-color: var(--border-color);
        }

        body.vscode-dark .d2h-code-line-ctn,
        body.vscode-dark .d2h-code-side-line,
        body.vscode-high-contrast .d2h-code-line-ctn,
        body.vscode-high-contrast .d2h-code-side-line {
            background-color: var(--bg-primary);
            color: var(--text-primary);
        }

        body.vscode-dark .d2h-code-linenumber,
        body.vscode-dark .d2h-code-side-linenumber,
        body.vscode-high-contrast .d2h-code-linenumber,
        body.vscode-high-contrast .d2h-code-side-linenumber {
            background-color: var(--bg-secondary);
            color: var(--text-muted);
            border-color: var(--border-color);
        }

        body.vscode-dark .d2h-del .d2h-code-line-ctn,
        body.vscode-dark .d2h-del .d2h-code-side-line,
        body.vscode-high-contrast .d2h-del .d2h-code-line-ctn,
        body.vscode-high-contrast .d2h-del .d2h-code-side-line {
            background-color: #3d1d26;
        }

        body.vscode-dark .d2h-ins .d2h-code-line-ctn,
        body.vscode-dark .d2h-ins .d2h-code-side-line,
        body.vscode-high-contrast .d2h-ins .d2h-code-line-ctn,
        body.vscode-high-contrast .d2h-ins .d2h-code-side-line {
            background-color: #1f3d2a;
        }

        body.vscode-dark .d2h-emptyplaceholder,
        body.vscode-dark .d2h-code-side-emptyplaceholder,
        body.vscode-high-contrast .d2h-emptyplaceholder,
        body.vscode-high-contrast .d2h-code-side-emptyplaceholder {
            background-color: var(--bg-secondary);
            border-color: var(--border-color);
        }

        body.vscode-dark .d2h-file-list-wrapper,
        body.vscode-high-contrast .d2h-file-list-wrapper {
            background-color: var(--bg-secondary);
            border-color: var(--border-color);
        }

        body.vscode-dark .d2h-file-list-header,
        body.vscode-high-contrast .d2h-file-list-header {
            background-color: var(--bg-secondary);
        }

        body.vscode-dark .d2h-file-list-title,
        body.vscode-high-contrast .d2h-file-list-title {
            color: var(--text-primary);
        }

        body.vscode-dark .d2h-file-list li,
        body.vscode-high-contrast .d2h-file-list li {
            border-color: var(--border-color);
        }

        /* Unified (line-by-line) view specific styles */
        body.vscode-dark .d2h-file-diff .d2h-del,
        body.vscode-high-contrast .d2h-file-diff .d2h-del {
            background-color: rgba(248, 81, 73, 0.25);
        }

        body.vscode-dark .d2h-file-diff .d2h-ins,
        body.vscode-high-contrast .d2h-file-diff .d2h-ins {
            background-color: rgba(63, 185, 80, 0.25);
        }

        body.vscode-dark .d2h-file-diff .d2h-del .d2h-code-line-ctn,
        body.vscode-high-contrast .d2h-file-diff .d2h-del .d2h-code-line-ctn {
            background-color: rgba(248, 81, 73, 0.25);
        }

        body.vscode-dark .d2h-file-diff .d2h-ins .d2h-code-line-ctn,
        body.vscode-high-contrast .d2h-file-diff .d2h-ins .d2h-code-line-ctn {
            background-color: rgba(63, 185, 80, 0.25);
        }

        body.vscode-light .d2h-file-diff .d2h-del {
            background-color: #ffebe9;
        }

        body.vscode-light .d2h-file-diff .d2h-ins {
            background-color: #e6ffec;
        }

        body.vscode-light .d2h-file-diff .d2h-del .d2h-code-line-ctn {
            background-color: #ffebe9;
        }

        body.vscode-light .d2h-file-diff .d2h-ins .d2h-code-line-ctn {
            background-color: #e6ffec;
        }

        /* Deletion marker color */
        body.vscode-dark .d2h-del .d2h-code-line-prefix,
        body.vscode-high-contrast .d2h-del .d2h-code-line-prefix {
            color: #f85149;
        }

        /* Insertion marker color */
        body.vscode-dark .d2h-ins .d2h-code-line-prefix,
        body.vscode-high-contrast .d2h-ins .d2h-code-line-prefix {
            color: #3fb950;
        }

        body.vscode-light .d2h-del .d2h-code-line-prefix {
            color: #cf222e;
        }

        body.vscode-light .d2h-ins .d2h-code-line-prefix {
            color: #1a7f37;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="content">
            <div id="visual-tab" class="tab-content active" role="tabpanel" aria-labelledby="visual-tab-btn">
                <div id="diff-output"></div>
            </div>
            <div id="content-tab" class="tab-content" role="tabpanel" aria-labelledby="content-tab-btn">
                <textarea id="content-output"></textarea>
            </div>
        </div>
        <div class="header">
            <div class="tabs" role="tablist" aria-label="View tabs">
                <button class="tab active" data-tab="visual" role="tab" aria-selected="true" aria-controls="visual-tab" id="visual-tab-btn">Visual</button>
                <button class="tab" data-tab="content" role="tab" aria-selected="false" aria-controls="content-tab" id="content-tab-btn">Content</button>
            </div>
            <div class="view-toggle" role="group" aria-label="View mode">
                <button class="view-btn active" data-view="side-by-side" aria-pressed="true" aria-label="Side-by-Side view">Side-by-Side</button>
                <button class="view-btn" data-view="unified" aria-pressed="false" aria-label="Unified view">Unified</button>
            </div>
        </div>
    </div>

    <script nonce="${nonce}" src="${diff2htmlJsUri}"></script>
    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();
            
            // DOM elements
            const diffOutput = document.getElementById('diff-output');
            const contentOutput = document.getElementById('content-output');
            const tabContents = document.querySelectorAll('.tab-content');
            const tabs = document.querySelectorAll('.tab');
            const viewBtns = document.querySelectorAll('.view-btn');
            
            // State
            let currentContent = ${JSON.stringify(content)};
            let currentViewMode = 'side-by-side';
            
            // Initialize
            function init() {
                bindEvents();
                renderDiff();
                updateContentTab();
            }
            
            // Bind events
            function bindEvents() {
                // Tab switching
                tabs.forEach(tab => {
                    tab.addEventListener('click', () => {
                        const targetTab = tab.dataset.tab;
                        switchTab(targetTab);
                    });
                });
                
                // View mode switching
                viewBtns.forEach(btn => {
                    btn.addEventListener('click', () => {
                        const viewMode = btn.dataset.view;
                        setViewMode(viewMode);
                    });
                });
                
                // Content editing - send changes to VS Code
                contentOutput.addEventListener('input', () => {
                    const newContent = contentOutput.value;
                    if (newContent !== currentContent) {
                        currentContent = newContent;
                        vscode.postMessage({
                            type: 'contentChanged',
                            content: newContent
                        });
                        renderDiff();
                    }
                });
                
                // Handle messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'update':
                            currentContent = message.content;
                            renderDiff();
                            updateContentTab();
                            break;
                        case 'themeChanged':
                            applyTheme(message.kind);
                            renderDiff();
                            break;
                        case 'setViewMode':
                            setViewMode(message.viewMode, false);
                            break;
                    }
                });
            }
            
            // Set view mode
            function setViewMode(viewMode, notify = true) {
                currentViewMode = viewMode;
                viewBtns.forEach(btn => {
                    const isActive = btn.dataset.view === viewMode;
                    btn.classList.toggle('active', isActive);
                    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
                });
                renderDiff();
                
                if (notify) {
                    vscode.postMessage({
                        type: 'viewModeChanged',
                        viewMode: viewMode
                    });
                }
            }
            
            // Switch between tabs
            function switchTab(targetTab) {
                // Update tab buttons
                tabs.forEach(tab => {
                    const isActive = tab.dataset.tab === targetTab;
                    tab.classList.toggle('active', isActive);
                    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
                });
                
                // Update tab content visibility
                tabContents.forEach(content => {
                    const isActive = content.id === targetTab + '-tab';
                    content.classList.toggle('active', isActive);
                });
            }
            
            // Update content tab with raw content
            function updateContentTab() {
                if (contentOutput) {
                    contentOutput.value = currentContent || '';
                }
            }
            
            // Apply VS Code theme
            function applyTheme(themeKind) {
                // Remove existing theme classes
                document.body.classList.remove('vscode-light', 'vscode-dark', 'vscode-high-contrast');
                
                // Add appropriate class based on theme kind
                // ThemeKind: 1 = Light, 2 = Dark, 3 = High Contrast
                switch (themeKind) {
                    case 1:
                        document.body.classList.add('vscode-light');
                        break;
                    case 2:
                        document.body.classList.add('vscode-dark');
                        break;
                    case 3:
                        document.body.classList.add('vscode-high-contrast');
                        break;
                }
            }
            
            // Setup synchronized horizontal scrolling for side-by-side view
            function setupSynchronizedScroll() {
                const sideBySideTables = diffOutput.querySelectorAll('.d2h-file-side-diff');
                if (sideBySideTables.length < 2) return;
                
                let isScrolling = false;
                
                sideBySideTables.forEach((table, index) => {
                    table.addEventListener('scroll', function() {
                        if (isScrolling) return;
                        isScrolling = true;
                        
                        const scrollLeft = this.scrollLeft;
                        sideBySideTables.forEach((otherTable, otherIndex) => {
                            if (otherIndex !== index) {
                                otherTable.scrollLeft = scrollLeft;
                            }
                        });
                        
                        // Reset the flag after a short delay
                        setTimeout(() => {
                            isScrolling = false;
                        }, 10);
                    });
                });
            }
            
            // Setup viewed checkbox functionality for each file
            function setupViewedCheckboxes() {
                const fileWrappers = diffOutput.querySelectorAll('.d2h-file-wrapper');
                fileWrappers.forEach((wrapper, index) => {
                    const header = wrapper.querySelector('.d2h-file-header');
                    if (!header) return;
                    
                    // Check if checkbox already exists
                    if (header.querySelector('.d2h-viewed-checkbox')) return;
                    
                    // Create viewed checkbox container
                    const checkboxContainer = document.createElement('label');
                    checkboxContainer.className = 'd2h-viewed-checkbox';
                    checkboxContainer.style.cssText = 'display: flex; align-items: center; gap: 4px; margin-left: auto; padding-right: 8px; cursor: pointer; font-size: 12px; color: var(--text-muted);';
                    
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.style.cssText = 'cursor: pointer;';
                    checkbox.addEventListener('change', function() {
                        if (this.checked) {
                            wrapper.style.opacity = '0.5';
                            wrapper.dataset.viewed = 'true';
                        } else {
                            wrapper.style.opacity = '1';
                            wrapper.dataset.viewed = 'false';
                        }
                    });
                    
                    const labelText = document.createElement('span');
                    labelText.textContent = 'Viewed';
                    
                    checkboxContainer.appendChild(checkbox);
                    checkboxContainer.appendChild(labelText);
                    
                    // Insert checkbox into header
                    const fileNameWrapper = header.querySelector('.d2h-file-name-wrapper');
                    if (fileNameWrapper) {
                        fileNameWrapper.style.display = 'flex';
                        fileNameWrapper.style.alignItems = 'center';
                        fileNameWrapper.style.width = '100%';
                        fileNameWrapper.appendChild(checkboxContainer);
                    }
                });
            }
            
            // Render diff using diff2html
            function renderDiff() {
                if (!currentContent || !currentContent.trim()) {
                    diffOutput.innerHTML = '<div class="placeholder">No diff content to display</div>';
                    return;
                }
                
                // Check if Diff2Html is available
                const Diff2HtmlLib = typeof Diff2Html !== 'undefined' ? Diff2Html : window.Diff2Html;
                if (!Diff2HtmlLib) {
                    const errorMsg = 'Diff2Html library is not loaded. Please reload the editor.';
                    vscode.postMessage({
                        type: 'error',
                        message: 'Failed to render diff',
                        error: 'Diff2Html is not defined'
                    });
                    diffOutput.innerHTML = '<div class="placeholder">' + errorMsg + '</div>';
                    return;
                }
                
                try {
                    const outputFormat = currentViewMode === 'side-by-side' ? 'side-by-side' : 'line-by-line';
                    
                    // First, try to parse the diff content
                    const diffJson = Diff2HtmlLib.parse(currentContent, {
                        inputFormat: 'diff'
                    });
                    
                    // Check if parsing produced valid results with actual changes
                    if (!diffJson || diffJson.length === 0) {
                        const errorMsg = 'Unable to parse diff content. Please check if the content is a valid diff/patch format.';
                        vscode.postMessage({
                            type: 'error',
                            message: errorMsg,
                            error: 'Diff2Html.parse returned empty result'
                        });
                        diffOutput.innerHTML = '<div class="placeholder">' + errorMsg + '</div>';
                        return;
                    }
                    
                    // Verify parsed content has meaningful data (at least one file with blocks)
                    const hasValidBlocks = diffJson.some(file => file.blocks && file.blocks.length > 0);
                    if (!hasValidBlocks) {
                        const errorMsg = 'No valid diff blocks found. The content may not be in the expected diff/patch format.';
                        vscode.postMessage({
                            type: 'error',
                            message: errorMsg,
                            error: 'No blocks found in parsed diff'
                        });
                        diffOutput.innerHTML = '<div class="placeholder">' + errorMsg + '</div>';
                        return;
                    }
                    
                    // Generate HTML from parsed diff
                    const html = Diff2HtmlLib.html(diffJson, {
                        inputFormat: 'json',
                        outputFormat: outputFormat,
                        showFiles: true,
                        matching: 'lines',
                        matchWordsThreshold: 0.25,
                        maxLineLengthHighlight: 10000,
                        renderNothingWhenEmpty: false,
                        fileListToggle: true,
                        fileListStartVisible: true,
                        fileContentToggle: true,
                        stickyFileHeaders: true,
                        synchronisedScroll: true
                    });
                    
                    // Check if HTML output is empty
                    if (!html || html.trim() === '') {
                        diffOutput.innerHTML = '<div class="placeholder">Failed to generate diff view. The content could not be rendered.</div>';
                        return;
                    }
                    
                    diffOutput.innerHTML = html;
                    
                    // Setup synchronized scrolling for side-by-side view
                    if (currentViewMode === 'side-by-side') {
                        setupSynchronizedScroll();
                    }
                    
                    // Add viewed checkbox functionality
                    setupViewedCheckboxes();
                } catch (error) {
                    const errorMessage = 'An error occurred while rendering the diff. Please check if the content is a valid diff/patch format.';
                    console.error('Failed to render diff:', error);
                    // Send error to VS Code output channel
                    vscode.postMessage({
                        type: 'error',
                        message: 'Failed to render diff',
                        error: error instanceof Error ? error.message : String(error)
                    });
                    diffOutput.innerHTML = '<div class="placeholder">' + errorMessage + '</div>';
                }
            }
            
            // Initialize
            init();
        })();
    </script>
</body>
</html>
        `;
    }
}

/**
 * Generate a nonce for Content Security Policy
 */
function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
