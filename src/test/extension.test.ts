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

    test('Generated webview script should be valid JavaScript', () => {
        const provider = new PatchEditorProvider({ subscriptions: [] } as any);
        const panel = vscode.window.createWebviewPanel(
            'tlcsdm.patchReader.test',
            'Patch Reader Test',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );
        try {
            const cssUri = panel.webview.asWebviewUri(vscode.Uri.file('/assets/diff2html.min.css'));
            const jsUri = panel.webview.asWebviewUri(vscode.Uri.file('/assets/diff2html.min.js'));
            // Content that would break naive inline embedding, to also exercise the escaping
            // (a diffed <script> tag plus a git format-patch footer).
            const trickyContent = [
                'diff --git a/index.html b/index.html',
                '@@ -1 +1 @@',
                '-<script>a()</script>',
                '+<script>b()</script>',
                '-- ',
                '2.43.0',
                ''
            ].join('\n');

            const html = (provider as any).getHtmlForWebview(panel.webview, trickyContent, cssUri, jsUri);

            // Extract the inline application script (the nonce <script> block that has no src attribute).
            const match = html.match(/<script nonce="[^"]*">([\s\S]*?)<\/script>/);
            assert.ok(match, 'Inline application script block should be present in the webview HTML');
            const scriptBody = match[1];

            // new Function only parses (does not execute) the body, so browser globals are not required.
            // A malformed script — e.g. a comment or string literal broken by an unescaped newline —
            // would throw a SyntaxError here.
            assert.doesNotThrow(
                () => new Function(scriptBody),
                'Inline webview script must be syntactically valid JavaScript'
            );
        } finally {
            panel.dispose();
        }
    });
});
