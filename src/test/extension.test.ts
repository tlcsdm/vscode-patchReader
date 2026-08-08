import * as assert from 'assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { PatchEditorProvider, resolveDiff2HtmlAssetDirectory } from '../patchEditorProvider';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('unknowIfGuestInDream.tlcsdm-patch-reader'));
    });

    test('Should activate extension', async () => {
        const extension = vscode.extensions.getExtension('unknowIfGuestInDream.tlcsdm-patch-reader');
        if (extension) {
            await extension.activate();
            assert.ok(extension.isActive);
        }
    });

    test('Should register custom editor', () => {
        // Check that the command is registered
        return vscode.commands.getCommands(true).then(commands => {
            assert.ok(commands.includes('tlcsdm.patchReader.toggleView'));
        });
    });

    test('Should prefer packaged diff2html assets when available', () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-reader-media-'));
        try {
            const mediaCss = path.join(tempRoot, 'media', 'diff2html', 'css', 'diff2html.min.css');
            const mediaJs = path.join(tempRoot, 'media', 'diff2html', 'js', 'diff2html.min.js');
            const nodeModulesCss = path.join(tempRoot, 'node_modules', 'diff2html', 'bundles', 'css', 'diff2html.min.css');
            const nodeModulesJs = path.join(tempRoot, 'node_modules', 'diff2html', 'bundles', 'js', 'diff2html.min.js');

            fs.mkdirSync(path.dirname(mediaCss), { recursive: true });
            fs.mkdirSync(path.dirname(mediaJs), { recursive: true });
            fs.mkdirSync(path.dirname(nodeModulesCss), { recursive: true });
            fs.mkdirSync(path.dirname(nodeModulesJs), { recursive: true });
            fs.writeFileSync(mediaCss, '');
            fs.writeFileSync(mediaJs, '');
            fs.writeFileSync(nodeModulesCss, '');
            fs.writeFileSync(nodeModulesJs, '');

            assert.strictEqual(
                resolveDiff2HtmlAssetDirectory(tempRoot),
                path.join(tempRoot, 'media', 'diff2html')
            );
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    test('Should fall back to node_modules diff2html assets when media assets are missing', () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-reader-node-modules-'));
        try {
            const nodeModulesCss = path.join(tempRoot, 'node_modules', 'diff2html', 'bundles', 'css', 'diff2html.min.css');
            const nodeModulesJs = path.join(tempRoot, 'node_modules', 'diff2html', 'bundles', 'js', 'diff2html.min.js');

            fs.mkdirSync(path.dirname(nodeModulesCss), { recursive: true });
            fs.mkdirSync(path.dirname(nodeModulesJs), { recursive: true });
            fs.writeFileSync(nodeModulesCss, '');
            fs.writeFileSync(nodeModulesJs, '');

            assert.strictEqual(
                resolveDiff2HtmlAssetDirectory(tempRoot),
                path.join(tempRoot, 'node_modules', 'diff2html', 'bundles')
            );
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    test('Webview client script file should be valid JavaScript', () => {
        // The webview client script is now a standalone static file loaded via
        // asWebviewUri(), so it is delivered to the browser verbatim. Validate
        // that the shipped file parses as JavaScript.
        const extension = vscode.extensions.getExtension('unknowIfGuestInDream.tlcsdm-patch-reader');
        assert.ok(extension, 'Extension should be present');
        const scriptPath = path.join(extension.extensionPath, 'media', 'patchViewer.js');
        assert.ok(fs.existsSync(scriptPath), 'media/patchViewer.js should exist');
        const scriptBody = fs.readFileSync(scriptPath, 'utf8');

        // new Function only parses (does not execute) the body, so browser globals
        // are not required. A malformed script would throw a SyntaxError here.
        assert.doesNotThrow(
            () => new Function(scriptBody),
            'Webview client script must be syntactically valid JavaScript'
        );
    });

    test('Webview client script and diff2html should render a diff end-to-end', async () => {
        // End-to-end validation of the diff2html usage: load the shipped
        // diff2html bundle and the webview client script into a DOM and assert
        // that a patch is actually rendered into #diff-output. This guards
        // against the "blank Visual tab" class of regressions.
        const { JSDOM } = await import('jsdom');

        const extension = vscode.extensions.getExtension('unknowIfGuestInDream.tlcsdm-patch-reader');
        assert.ok(extension, 'Extension should be present');
        const assetDir = resolveDiff2HtmlAssetDirectory(extension.extensionPath);
        const diff2htmlJsPath = path.join(assetDir, 'js', 'diff2html.min.js');
        assert.ok(fs.existsSync(diff2htmlJsPath), 'diff2html.min.js should be available for the webview');
        const diff2htmlJs = fs.readFileSync(diff2htmlJsPath, 'utf8');
        const patchViewerJs = fs.readFileSync(
            path.join(extension.extensionPath, 'media', 'patchViewer.js'),
            'utf8'
        );

        const patch = [
            'diff --git a/file.txt b/file.txt',
            'index 0000000..1111111 100644',
            '--- a/file.txt',
            '+++ b/file.txt',
            '@@ -1 +1 @@',
            '-old line',
            '+new line',
            ''
        ].join('\n');
        const initialContentJson = JSON.stringify(patch).replace(/</g, '\\u003c');

        const html = `<!DOCTYPE html><html><head></head><body>
<div class="container">
    <div class="content">
        <div id="visual-tab" class="tab-content active"><div id="diff-output"></div></div>
        <div id="content-tab" class="tab-content"><textarea id="content-output"></textarea></div>
    </div>
    <div class="header">
        <div class="tabs">
            <button class="tab active" data-tab="visual">Visual</button>
            <button class="tab" data-tab="content">Content</button>
        </div>
        <div class="view-toggle">
            <button class="view-btn active" data-view="side-by-side">Side-by-Side</button>
            <button class="view-btn" data-view="unified">Unified</button>
        </div>
    </div>
</div>
<script id="patch-initial-content" type="application/json">${initialContentJson}</script>
</body></html>`;

        const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
        const { window } = dom;
        try {
            (window as any).acquireVsCodeApi = () => ({
                postMessage: () => { /* no-op */ }
            });

            const bundleScript = window.document.createElement('script');
            bundleScript.textContent = diff2htmlJs;
            window.document.body.appendChild(bundleScript);
            assert.ok(
                (window as any).Diff2Html,
                'diff2html bundle should expose a global Diff2Html'
            );

            const viewerScript = window.document.createElement('script');
            viewerScript.textContent = patchViewerJs;
            window.document.body.appendChild(viewerScript);

            const diffOutput = window.document.getElementById('diff-output');
            assert.ok(diffOutput, '#diff-output should exist');
            assert.ok(
                diffOutput!.querySelector('.d2h-file-wrapper'),
                'diff2html should render at least one file into #diff-output'
            );

            // Content tab must be switchable: clicking the Content tab activates it.
            const contentTabBtn = window.document.querySelector('.tab[data-tab="content"]') as any;
            assert.ok(contentTabBtn, 'Content tab button should exist');
            contentTabBtn!.click();
            assert.ok(
                window.document.getElementById('content-tab')!.classList.contains('active'),
                'Clicking the Content tab should activate the content panel'
            );
            assert.strictEqual(
                (window.document.getElementById('content-output') as any).value,
                patch,
                'Content tab should display the raw patch text'
            );
        } finally {
            window.close();
        }
    });

    test('Initial patch content should be embedded safely and round-trip', () => {
        const provider = new PatchEditorProvider({
            extensionUri: vscode.Uri.file('/ext'),
            subscriptions: []
        } as any);
        const panel = vscode.window.createWebviewPanel(
            'tlcsdm.patchReader.test',
            'Patch Reader Test',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );
        try {
            const cssUri = panel.webview.asWebviewUri(vscode.Uri.file('/assets/diff2html.min.css'));
            const jsUri = panel.webview.asWebviewUri(vscode.Uri.file('/assets/diff2html.min.js'));
            const viewerCssUri = panel.webview.asWebviewUri(vscode.Uri.file('/media/patchViewer.css'));
            const viewerJsUri = panel.webview.asWebviewUri(vscode.Uri.file('/media/patchViewer.js'));

            // Content that would break naive inline embedding: a diffed <script> tag,
            // an HTML comment, and a git format-patch footer.
            const trickyContent = [
                'diff --git a/index.html b/index.html',
                '@@ -1 +1 @@',
                '-<script>a()</script>',
                '+<script>b()</script><!-- x -->',
                '-- ',
                '2.43.0',
                ''
            ].join('\n');

            const html = (provider as any).getHtmlForWebview(
                panel.webview,
                trickyContent,
                cssUri,
                jsUri,
                viewerCssUri,
                viewerJsUri
            );

            // The client script must be referenced as an external file, not inlined.
            assert.ok(
                /<script[^>]*src="[^"]*patchViewer\.js"[^>]*><\/script>/.test(html),
                'Webview HTML should load the external patchViewer.js script'
            );

            // Because getHtmlForWebview escapes every "<" as "\u003c", the patch's
            // own "</script>" becomes "\u003c/script>" in the data block. The lazy
            // regex terminator below is therefore only matched by the block's real
            // closing tag, and the data block itself contains no raw "</script>".
            const dataMatch = html.match(
                /<script id="patch-initial-content" type="application\/json"[^>]*>([\s\S]*?)<\/script>/
            );
            assert.ok(dataMatch, 'Initial content data block should be present in the webview HTML');
            const dataBlock = dataMatch[1];
            assert.ok(
                !/<\/script/i.test(dataBlock),
                'Embedded content data block must not contain a raw </script> sequence'
            );

            // The data block must be valid JSON that round-trips to the original
            // content exactly, proving the escaping preserves the patch verbatim.
            assert.strictEqual(
                JSON.parse(dataBlock),
                trickyContent,
                'Embedded content must round-trip back to the original patch text'
            );
        } finally {
            panel.dispose();
        }
    });
});
