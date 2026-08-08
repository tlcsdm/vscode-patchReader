import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

const DIFF2HTML_ASSET_FILES = [
    path.join('css', 'diff2html.min.css'),
    path.join('js', 'diff2html.min.js')
];

/**
 * Check whether all required diff2html asset files exist under the given asset root.
 */
function hasDiff2HtmlAssets(assetRoot: string): boolean {
    return DIFF2HTML_ASSET_FILES.every(file => fs.existsSync(path.join(assetRoot, file)));
}

/**
 * Resolve the diff2html asset directory for this extension installation.
 * Prefers packaged media assets and falls back to the local dependency bundle
 * when running from a source checkout where copied media assets are absent.
 */
export function resolveDiff2HtmlAssetDirectory(extensionPath: string): string {
    const mediaAssetRoot = path.join(extensionPath, 'media', 'diff2html');
    if (hasDiff2HtmlAssets(mediaAssetRoot)) {
        return mediaAssetRoot;
    }

    const nodeModulesAssetRoot = path.join(extensionPath, 'node_modules', 'diff2html', 'bundles');
    if (hasDiff2HtmlAssets(nodeModulesAssetRoot)) {
        return nodeModulesAssetRoot;
    }

    return mediaAssetRoot;
}

/**
 * Custom editor provider for patch/diff files
 */
export class PatchEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'tlcsdm.patchReader.editor';
    
    private activeWebviewPanel: vscode.WebviewPanel | undefined;
    private currentViewMode: 'side-by-side' | 'unified' = 'side-by-side';
    private static outputChannel: vscode.OutputChannel | undefined;

    // eslint-disable-next-line no-unused-vars
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
     * Log info message to output channel
     */
    private logInfo(message: string): void {
        const timestamp = new Date().toISOString();
        PatchEditorProvider.outputChannel?.appendLine(`[${timestamp}] INFO: ${message}`);
    }

    /**
     * Log warning message to output channel
     */
    private logWarn(message: string, detail?: unknown): void {
        const timestamp = new Date().toISOString();
        const detailMessage = detail instanceof Error ? detail.message : (detail ? String(detail) : '');
        const logMessage = detailMessage ? `[${timestamp}] WARN: ${message} - ${detailMessage}` : `[${timestamp}] WARN: ${message}`;
        PatchEditorProvider.outputChannel?.appendLine(logMessage);
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
        _token: vscode.CancellationToken
    ): Promise<void> {
        this.activeWebviewPanel = webviewPanel;
        this.logInfo(`Opening patch editor for: ${document.uri.fsPath}`);

        // Setup webview options
        const diff2htmlAssetDirectory = resolveDiff2HtmlAssetDirectory(this.context.extensionUri.fsPath);
        if (!hasDiff2HtmlAssets(diff2htmlAssetDirectory)) {
            this.logError(`Diff2Html assets were not found in ${diff2htmlAssetDirectory}`);
        } else {
            this.logInfo(`Using diff2html assets from: ${diff2htmlAssetDirectory}`);
        }

        const diff2htmlAssetRoot = vscode.Uri.file(diff2htmlAssetDirectory);
        const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, 'media');

        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                mediaRoot,
                diff2htmlAssetRoot
            ]
        };

        // Get URIs for diff2html resources from the packaged media folder or the local dependency fallback
        const diff2htmlCssUri = webviewPanel.webview.asWebviewUri(
            vscode.Uri.joinPath(diff2htmlAssetRoot, 'css', 'diff2html.min.css')
        );
        const diff2htmlJsUri = webviewPanel.webview.asWebviewUri(
            vscode.Uri.joinPath(diff2htmlAssetRoot, 'js', 'diff2html.min.js')
        );

        // Get URIs for the extension's own webview assets (kept as standalone
        // static files so the browser receives them verbatim).
        const patchViewerCssUri = webviewPanel.webview.asWebviewUri(
            vscode.Uri.joinPath(mediaRoot, 'patchViewer.css')
        );
        const patchViewerJsUri = webviewPanel.webview.asWebviewUri(
            vscode.Uri.joinPath(mediaRoot, 'patchViewer.js')
        );

        // Set initial HTML content
        webviewPanel.webview.html = this.getHtmlForWebview(
            webviewPanel.webview,
            document.getText(),
            diff2htmlCssUri,
            diff2htmlJsUri,
            patchViewerCssUri,
            patchViewerJsUri
        );

        // Handle messages from the webview
        webviewPanel.webview.onDidReceiveMessage(async message => {
            switch (message.type) {
                case 'viewModeChanged':
                    this.currentViewMode = message.viewMode;
                    this.logInfo(`View mode changed to: ${message.viewMode}`);
                    break;
                case 'log':
                    this.logInfo(`[Webview] ${message.message}`);
                    break;
                case 'warn':
                    this.logWarn(`[Webview] ${message.message}`);
                    break;
                case 'error':
                    this.logError(`[Webview] ${message.message}`, message.error);
                    break;
                case 'contentChanged': {
                    // Apply edits from the webview to the document
                    try {
                        const edit = new vscode.WorkspaceEdit();
                        const fullRange = new vscode.Range(
                            document.positionAt(0),
                            document.positionAt(document.getText().length)
                        );
                        edit.replace(document.uri, fullRange, message.content);
                        await vscode.workspace.applyEdit(edit);
                    } catch (err) {
                        this.logError('Failed to apply content edit to document', err);
                    }
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
        diff2htmlJsUri: vscode.Uri,
        patchViewerCssUri: vscode.Uri,
        patchViewerJsUri: vscode.Uri
    ): string {
        const nonce = getNonce();

        // Embed the initial patch content in a non-executable JSON data block.
        // Escaping every "<" as "\u003c" keeps the JSON valid while guaranteeing
        // the raw text can never contain "</script>", so the HTML parser cannot
        // close the data block early — regardless of what the patch contains.
        const initialContentJson = JSON.stringify(content).replace(/</g, '\\u003c');

        return /* html */`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <link href="${diff2htmlCssUri}" rel="stylesheet">
    <link href="${patchViewerCssUri}" rel="stylesheet">
    <title>Patch Reader</title>
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

    <script id="patch-initial-content" type="application/json" nonce="${nonce}">${initialContentJson}</script>
    <script nonce="${nonce}" src="${diff2htmlJsUri}"></script>
    <script nonce="${nonce}" src="${patchViewerJsUri}"></script>
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
