// Patch Reader webview client script.
//
// Loaded into the custom editor webview via webview.asWebviewUri(). Keeping this
// as a standalone static file (rather than inlining it in a TypeScript template
// literal) means the browser receives it verbatim, so escape sequences such as
// "\n" and "</script>" can never be mangled by the surrounding literal. The
// diff2html library is loaded before this script and exposes a global Diff2Html.
//
// The initial patch content is read from a non-executable JSON data block
// (#patch-initial-content) that the extension injects into the page.
(function() {
    const vscode = acquireVsCodeApi();
    
    // Logging helpers — forward messages to the VS Code output channel
    function logInfo(message) {
        vscode.postMessage({ type: 'log', message: message });
    }
    function logWarn(message) {
        vscode.postMessage({ type: 'warn', message: message });
    }
    function logError(message, error) {
        vscode.postMessage({ type: 'error', message: message, error: error instanceof Error ? error.message : String(error || '') });
    }

    // Read the initial patch content that the extension embedded in a
    // non-executable JSON data block. Using a data block (instead of inlining
    // the content into executable JS) means malformed or "</script>"-containing
    // patches can never break the script.
    function getInitialContent() {
        const dataEl = document.getElementById('patch-initial-content');
        if (!dataEl) {
            return '';
        }
        try {
            return JSON.parse(dataEl.textContent || '""');
        } catch (error) {
            logError('Failed to parse initial patch content', error);
            return '';
        }
    }
    
    // DOM elements
    const diffOutput = document.getElementById('diff-output');
    const contentOutput = document.getElementById('content-output');
    const tabContents = document.querySelectorAll('.tab-content');
    const tabs = document.querySelectorAll('.tab');
    const viewBtns = document.querySelectorAll('.view-btn');
    
    if (!diffOutput) {
        logError('Failed to find #diff-output element in DOM');
    }
    if (!contentOutput) {
        logError('Failed to find #content-output element in DOM');
    }
    
    // State
    let currentContent = getInitialContent();
    let currentViewMode = 'side-by-side';
    let renderDebounceTimer = null;
    
    // Debounce helper
    function debounce(fn, delay) {
        return function(...args) {
            if (renderDebounceTimer) {
                clearTimeout(renderDebounceTimer);
            }
            renderDebounceTimer = setTimeout(() => fn.apply(this, args), delay);
        };
    }
    
    // Debounced render for content changes
    const debouncedRenderDiff = debounce(renderDiff, 300);
    
    // Initialize
    function init() {
        logInfo('Initializing patch viewer');
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
        if (contentOutput) {
            contentOutput.addEventListener('input', () => {
                const newContent = contentOutput.value;
                if (newContent !== currentContent) {
                    currentContent = newContent;
                    vscode.postMessage({
                        type: 'contentChanged',
                        content: newContent
                    });
                    debouncedRenderDiff();
                }
            });
        }
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'update':
                    logInfo('Document updated, re-rendering diff');
                    currentContent = message.content;
                    renderDiff();
                    updateContentTab();
                    break;
                case 'themeChanged':
                    logInfo('Theme changed to kind: ' + message.kind);
                    applyTheme(message.kind);
                    renderDiff();
                    break;
                case 'setViewMode':
                    logInfo('View mode set to: ' + message.viewMode);
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
        // ThemeKind: 1 = Light, 2 = Dark, 3 = HighContrast (Dark), 4 = HighContrast (Light)
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
            case 4:
                document.body.classList.add('vscode-light');
                break;
        }
    }
    
    // Setup synchronized horizontal scrolling for side-by-side view
    function setupSynchronizedScroll() {
        // Find all file wrappers with side-by-side diff
        const fileWrappers = diffOutput.querySelectorAll('.d2h-file-wrapper');
        
        fileWrappers.forEach(wrapper => {
            const sidePanels = wrapper.querySelectorAll('.d2h-file-side-diff');
            if (sidePanels.length !== 2) return;
            
            const leftPanel = sidePanels[0];
            const rightPanel = sidePanels[1];
            let scrollSource = null;
            
            function syncScroll(source, target) {
                if (scrollSource && scrollSource !== source) return;
                scrollSource = source;
                
                requestAnimationFrame(() => {
                    target.scrollLeft = source.scrollLeft;
                    scrollSource = null;
                });
            }
            
            leftPanel.addEventListener('scroll', function() {
                syncScroll(this, rightPanel);
            });
            
            rightPanel.addEventListener('scroll', function() {
                syncScroll(this, leftPanel);
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
            
            // Get file name for accessibility
            const fileNameEl = header.querySelector('.d2h-file-name');
            const fileName = fileNameEl ? fileNameEl.textContent : 'File ' + (index + 1);
            const checkboxId = 'd2h-viewed-' + index;
            
            // Create viewed checkbox container
            const checkboxContainer = document.createElement('label');
            checkboxContainer.className = 'd2h-viewed-checkbox';
            checkboxContainer.setAttribute('for', checkboxId);
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = checkboxId;
            checkbox.setAttribute('aria-label', 'Mark ' + fileName + ' as viewed');
            checkbox.addEventListener('change', function() {
                wrapper.classList.toggle('viewed', this.checked);
            });
            
            const labelText = document.createElement('span');
            labelText.textContent = 'Viewed';
            
            checkboxContainer.appendChild(checkbox);
            checkboxContainer.appendChild(labelText);
            
            // Insert checkbox into header
            const fileNameWrapper = header.querySelector('.d2h-file-name-wrapper');
            if (fileNameWrapper) {
                fileNameWrapper.appendChild(checkboxContainer);
            }
        });
    }
    
    // Strip git format-patch footer (a trailing "-- " line followed by a git version such as 2.43.0).
    // This footer is added by git format-patch and should not be parsed as diff content.
    function stripGitPatchFooter(content) {
        if (!content) return content;
        // Match the git email signature footer: a "-- " line on its own,
        // immediately followed by a git version number (such as 2.43.0).
        return content.replace(/\n-- \n\d+\.\d+[^\n]*\n?$/, '\n');
    }
    
    // Render diff using diff2html
    function renderDiff() {
        if (!diffOutput) {
            logError('Cannot render diff: #diff-output element not found');
            return;
        }
        if (!currentContent || !currentContent.trim()) {
            logInfo('No diff content to display');
            diffOutput.innerHTML = '<div class="placeholder">No diff content to display</div>';
            return;
        }
        
        // Check if Diff2Html is available
        const Diff2HtmlLib = typeof Diff2Html !== 'undefined' ? Diff2Html : window.Diff2Html;
        if (!Diff2HtmlLib) {
            const errorMsg = 'Diff2Html library is not loaded. Please reload the editor.';
            logError('Failed to render diff', 'Diff2Html is not defined — check that the extension assets are correctly installed');
            diffOutput.innerHTML = '<div class="placeholder">' + errorMsg + '</div>';
            return;
        }
        
        try {
            const outputFormat = currentViewMode === 'side-by-side' ? 'side-by-side' : 'line-by-line';
            
            // Strip git format-patch footer before parsing
            const contentToParse = stripGitPatchFooter(currentContent);
            
            // Parse the diff content
            const diffJson = Diff2HtmlLib.parse(contentToParse, {
                inputFormat: 'diff'
            });
            
            // Check if parsing produced any results
            if (!diffJson || diffJson.length === 0) {
                const errorMsg = 'Unable to parse diff content. Please check if the content is a valid diff/patch format.';
                logWarn('Diff2Html.parse returned an empty result for the provided content');
                diffOutput.innerHTML = '<div class="placeholder">' + errorMsg + '</div>';
                return;
            }
            
            logInfo('Rendering diff: ' + diffJson.length + ' file(s), format=' + outputFormat);
            
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
                stickyFileHeaders: true
            });
            
            // Check if HTML output is empty
            if (!html || html.trim() === '') {
                logWarn('Diff2Html.html returned empty output for ' + diffJson.length + ' parsed file(s)');
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
            logError('Failed to render diff', error);
            diffOutput.innerHTML = '<div class="placeholder">' + errorMessage + '</div>';
        }
    }
    
    // Initialize
    try {
        init();
    } catch (error) {
        logError('Fatal error during initialization', error);
        if (diffOutput) {
            diffOutput.innerHTML = '<div class="placeholder">Failed to initialize the viewer. Please close and reopen the file.</div>';
        }
    }
})();
