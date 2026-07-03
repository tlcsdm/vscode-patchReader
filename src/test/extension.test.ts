import * as assert from 'assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { resolveDiff2HtmlAssetDirectory } from '../patchEditorProvider';

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

        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    test('Should fall back to node_modules diff2html assets when media assets are missing', () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-reader-node-modules-'));
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

        fs.rmSync(tempRoot, { recursive: true, force: true });
    });
});
