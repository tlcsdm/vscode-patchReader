import * as vscode from 'vscode';
import { PatchEditorProvider } from './patchEditorProvider';

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext): void {
    // Register the custom editor provider
    const provider = new PatchEditorProvider(context);
    
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            PatchEditorProvider.viewType,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                },
                supportsMultipleEditorsPerDocument: false
            }
        )
    );

    // Register toggle view command
    context.subscriptions.push(
        vscode.commands.registerCommand('tlcsdm.patchReader.toggleView', () => {
            provider.toggleViewMode();
        })
    );
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
    // Clean up resources if needed
}
