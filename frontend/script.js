class LovableClone {
    constructor() {
        this.currentGenerationId = null;
        this.pollInterval = null;
        this.selectedProject = null;
        this.projects = [];
        this.init();
    }

    init() {
        this.bindEvents();
        // Use setTimeout to ensure DOM is fully ready
        setTimeout(() => {
            this.loadExistingProjects();
        }, 100);
    }

    bindEvents() {
        const generateBtn = document.getElementById('generate-btn');
        const refreshBtn = document.getElementById('refresh-btn');
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        const clearLogsBtn = document.getElementById('clear-logs-btn');
        const copyLogsBtn = document.getElementById('copy-logs-btn');
        const refreshProjectsBtn = document.getElementById('refresh-projects-btn');
        const clearSelectionBtn = document.getElementById('clear-selection-btn');
        const infoBtn = document.getElementById('info-btn');
        const modalCloseBtn = document.getElementById('modal-close-btn');
        const infoModal = document.getElementById('info-modal');
        const promptInput = document.getElementById('prompt-input');

        generateBtn.addEventListener('click', () => this.handleGenerate());
        refreshBtn.addEventListener('click', () => this.refreshPreview());
        fullscreenBtn.addEventListener('click', () => this.openInNewTab());
        clearLogsBtn.addEventListener('click', () => this.clearVerboseLogs());
        copyLogsBtn.addEventListener('click', () => this.copyVerboseLogs());
        refreshProjectsBtn.addEventListener('click', () => this.loadProjects());
        clearSelectionBtn.addEventListener('click', () => this.clearProjectSelection());
        infoBtn.addEventListener('click', () => this.openInfoModal());
        modalCloseBtn.addEventListener('click', () => this.closeInfoModal());
        
        // Close modal when clicking outside
        infoModal.addEventListener('click', (e) => {
            if (e.target === infoModal) {
                this.closeInfoModal();
            }
        });
        
        // Close modal with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !infoModal.classList.contains('hidden')) {
                this.closeInfoModal();
            }
        });
        
        // Allow Enter + Shift to submit
        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                this.handleGenerate();
            }
        });
    }

    async handleGenerate() {
        const promptInput = document.getElementById('prompt-input');
        const prompt = promptInput.value.trim();

        if (!prompt) {
            this.addLogEntry('error', '⚠️ Please enter a prompt first');
            return;
        }

        this.setGenerating(true);
        this.clearPreview();
        this.addLogEntry('info', `🚀 Starting generation: "${prompt}"`);
        this.addVerboseLog(`Starting generation request for prompt: "${prompt}"`);

        try {
            const requestBody = { prompt };
            
            // Add project continuation info if a project is selected
            if (this.selectedProject) {
                requestBody.continueFromProject = this.selectedProject.name;
                this.addVerboseLog(`Continuing work on project: ${this.selectedProject.name}`);
            }
            
            this.addVerboseLog('Sending POST request to /api/generate');
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();
            this.addVerboseLog(`Server response: ${JSON.stringify(data, null, 2)}`);

            if (response.ok) {
                this.currentGenerationId = data.generationId;
                this.addLogEntry('success', '✅ Generation started successfully');
                this.addVerboseLog(`Generation started with ID: ${data.generationId}`);
                this.startPolling();
            } else {
                throw new Error(data.error || 'Failed to start generation');
            }
        } catch (error) {
            this.addLogEntry('error', `❌ Error: ${error.message}`);
            this.addVerboseLog(`Error in handleGenerate: ${error.message}`, true);
            this.setGenerating(false);
        }
    }

    startPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }

        this.pollInterval = setInterval(async () => {
            if (!this.currentGenerationId) return;

            try {
                this.addVerboseLog(`Polling status for generation ID: ${this.currentGenerationId}`);
                const response = await fetch(`/api/status/${this.currentGenerationId}`);
                const data = await response.json();
                this.addVerboseLog(`Status response: ${JSON.stringify(data, null, 2)}`);

                if (response.ok) {
                    this.updateProgress(data);
                    
                    if (data.status === 'completed' || data.status === 'error') {
                        this.addVerboseLog(`Generation finished with status: ${data.status}`);
                        this.stopPolling();
                        this.setGenerating(false);
                        
                        if (data.status === 'completed' && data.projectPath) {
                            this.addVerboseLog(`Loading project from: ${data.projectPath}`);
                            await this.loadProject(data.projectPath);
                            // Refresh project list to show the new project
                            await this.loadProjects();
                        }
                    }
                } else {
                    this.addVerboseLog(`Status request failed: ${response.status} ${response.statusText}`, true);
                }
            } catch (error) {
                this.addVerboseLog(`Polling error: ${error.message}`, true);
                console.error('Polling error:', error);
            }
        }, 2000); // Poll every 2 seconds
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    updateProgress(data) {
        const statusElement = document.getElementById('progress-status');
        
        // Update status badge
        statusElement.textContent = this.formatStatus(data.status);
        statusElement.className = `progress-status ${data.status}`;

        // Add new progress entries
        if (data.progress && data.progress.length > 0) {
            const logContainer = document.getElementById('progress-log');
            const existingEntries = logContainer.children.length;
            
            // Add only new entries
            for (let i = existingEntries - 1; i < data.progress.length; i++) {
                const entry = data.progress[i];
                if (entry) {
                    this.addLogEntry(entry.type, entry.message, false);
                }
            }
        }

        // Update verbose logs from backend
        if (data.verboseLogs && data.verboseLogs.length > 0) {
            const verboseLog = document.getElementById('verbose-log');
            
            // Clear existing logs and add new ones (simple approach)
            const newLogContent = data.verboseLogs.map(log => 
                `${log.timestamp} [${log.level}] ${log.message}`
            ).join('\n');
            
            verboseLog.value = newLogContent;
            verboseLog.scrollTop = verboseLog.scrollHeight;
        }
    }

    async loadProject(projectPath) {
        try {
            // Get project info
            const response = await fetch('/api/projects');
            const data = await response.json();
            
            const project = data.projects.find(p => p.path.includes(projectPath.split('/').pop()));
            
            if (project && project.url) {
                this.showPreview(project.url);
                this.addLogEntry('success', `🎉 Project loaded: ${project.name}`);
            } else {
                this.addLogEntry('error', '❌ Could not find project entry point');
            }
        } catch (error) {
            this.addLogEntry('error', `❌ Error loading project: ${error.message}`);
        }
    }

    async loadExistingProjects() {
        // Call the new loadProjects method
        try {
            await this.loadProjects();
        } catch (error) {
            console.error('Error in loadExistingProjects:', error);
        }
    }

    async loadProjects() {
        const loadingEl = document.getElementById('projects-loading');
        const emptyEl = document.getElementById('projects-empty');
        const listEl = document.getElementById('projects-list');
        
        if (!loadingEl || !emptyEl || !listEl) {
            console.error('Required project list elements not found');
            return;
        }
        
        // Show loading state
        loadingEl.classList.remove('hidden');
        emptyEl.classList.add('hidden');
        
        // Clear existing project items
        const existingItems = listEl.querySelectorAll('.project-item');
        existingItems.forEach(item => item.remove());
        
        try {
            const response = await fetch('/api/projects');
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.projects = data.projects || [];
            
            // Hide loading
            loadingEl.classList.add('hidden');
            
            if (this.projects.length === 0) {
                emptyEl.classList.remove('hidden');
                return;
            }
            
            // Create project items with simple approach
            this.projects.forEach(project => {
                try {
                    // Create simple project element
                    const projectEl = document.createElement('div');
                    projectEl.className = 'project-item';
                    projectEl.style.background = 'rgba(255, 255, 255, 0.08)';
                    projectEl.style.border = '1px solid rgba(255, 255, 255, 0.15)';
                    projectEl.style.borderRadius = '12px';
                    projectEl.style.padding = '1rem';
                    projectEl.style.marginBottom = '0.75rem';
                    projectEl.style.cursor = 'pointer';
                    
                    // Simple project name (remove timestamp)
                    const simpleName = project.name
                        .replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-/, '')
                        .replace(/-/g, ' ')
                        .replace(/\b\w/g, l => l.toUpperCase())
                        .trim() || 'Untitled Project';
                    
                    projectEl.innerHTML = `
                        <div style="font-weight: 600; color: #f7fafc; margin-bottom: 0.5rem;">
                            ${simpleName}
                        </div>
                        <div style="font-size: 0.75rem; color: #94a3b8;">
                            ${project.fileCount} files
                        </div>
                    `;
                    
                    // Add click handler
                    if (project.url && project.fileCount > 0) {
                        projectEl.addEventListener('click', () => {
                            // Use the proper selectProject method to handle all UI updates
                            this.selectProject(project);
                        });
                        
                        // Hover effect
                        projectEl.addEventListener('mouseenter', () => {
                            if (!projectEl.classList.contains('selected')) {
                                projectEl.style.background = 'rgba(255, 255, 255, 0.12)';
                            }
                        });
                        
                        projectEl.addEventListener('mouseleave', () => {
                            if (!projectEl.classList.contains('selected')) {
                                projectEl.style.background = 'rgba(255, 255, 255, 0.08)';
                            }
                        });
                    } else {
                        projectEl.style.opacity = '0.5';
                        projectEl.style.cursor = 'not-allowed';
                        projectEl.title = 'No preview available';
                    }
                    
                    listEl.appendChild(projectEl);
                } catch (error) {
                    console.error('Error creating project element:', error, project);
                }
            });
            
            this.addLogEntry('info', `📂 Loaded ${this.projects.length} project(s)`);
            
        } catch (error) {
            console.error('Error loading projects:', error);
            loadingEl.classList.add('hidden');
            emptyEl.classList.remove('hidden');
            this.addLogEntry('error', `❌ Failed to load projects: ${error.message}`);
            if (this.addVerboseLog) {
                this.addVerboseLog(`Error loading projects: ${error.message}`, true);
            }
        }
    }

    createProjectElement(project) {
        try {
            const projectEl = document.createElement('div');
            projectEl.className = 'project-item';
            projectEl.dataset.projectName = project.name;
            
            // Skip projects with no files
            if (project.fileCount === 0) {
                projectEl.classList.add('project-empty');
            }
            
            // Extract project type and formatted name with error handling
            const displayName = this.formatProjectName(project.name);
            const projectType = this.detectProjectType(project.name);
            const createdDate = this.formatProjectDate(project);
            const fileTypes = this.getProjectFileTypes(project);
        
        projectEl.innerHTML = `
            <div class="project-name">${displayName}</div>
            <div class="project-meta">
                <span class="project-type">${projectType}</span>
                <span class="project-files" title="${fileTypes}">${project.fileCount} files</span>
                <span class="project-date">${createdDate}</span>
            </div>
        `;
        
        // Add click handler only for projects with files
        if (project.url && project.fileCount > 0) {
            projectEl.addEventListener('click', () => {
                this.selectProject(project);
            });
        } else {
            projectEl.style.opacity = '0.5';
            projectEl.style.cursor = 'not-allowed';
            projectEl.title = 'No preview available - project has no files';
        }
        
            return projectEl;
        } catch (error) {
            console.error('Error creating project element:', error, project);
            // Return a simple fallback element
            const fallbackEl = document.createElement('div');
            fallbackEl.className = 'project-item';
            fallbackEl.innerHTML = `<div class="project-name">Error: ${project.name}</div>`;
            return fallbackEl;
        }
    }

    selectProject(project) {
        // Remove previous selection
        const previousSelected = document.querySelector('.project-item.selected');
        if (previousSelected) {
            previousSelected.classList.remove('selected');
            // Reset inline styles for previously selected item
            previousSelected.style.background = 'rgba(255, 255, 255, 0.08)';
        }
        
        // Find and select the clicked project element
        const projectElements = document.querySelectorAll('.project-item');
        let projectEl = null;
        
        // Find the project element by matching the project name
        projectElements.forEach(el => {
            if (el.dataset.projectName === project.name || 
                (el.textContent && el.textContent.includes(this.formatProjectName(project.name)))) {
                projectEl = el;
            }
        });
        
        // Add selection to clicked item
        if (projectEl) {
            projectEl.classList.add('selected');
            projectEl.style.background = 'rgba(102, 126, 234, 0.15)';
        }
        
        // Update selected project state
        this.selectedProject = project;
        
        // Update UI to show continuation context
        this.showProjectContext(project);
        
        // Load project in preview
        if (project.url) {
            this.showPreview(project.url);
            this.addLogEntry('info', `🖥️ Loading project: ${this.formatProjectName(project.name)}`);
        } else {
            this.addLogEntry('error', `❌ No preview available for: ${project.name}`);
        }
    }

    showProjectContext(project) {
        const contextEl = document.getElementById('selected-project-context');
        const projectNameEl = document.getElementById('context-project-name');
        const projectDetailsEl = document.getElementById('context-project-details');
        const inputLabelEl = document.getElementById('input-label');
        const promptInputEl = document.getElementById('prompt-input');
        const generateBtnEl = document.getElementById('generate-btn');
        
        if (contextEl && projectNameEl && projectDetailsEl) {
            // Show context
            contextEl.classList.remove('hidden');
            
            // Update project info
            const displayName = this.formatProjectName(project.name);
            projectNameEl.textContent = displayName;
            
            const createdDate = this.formatProjectDate(project);
            const fileTypes = this.getProjectFileTypes(project);
            projectDetailsEl.textContent = `${project.fileCount} files (${fileTypes}) • Created ${createdDate}`;
            
            // Update input label and placeholder
            if (inputLabelEl) {
                inputLabelEl.textContent = 'What would you like to add or modify?';
            }
            
            if (promptInputEl) {
                promptInputEl.placeholder = `Describe changes or additions to ${displayName}... (e.g., 'Add a dark mode toggle' or 'Change the color scheme to blue')`;
            }
            
            // Update button text
            if (generateBtnEl) {
                const btnTextEl = generateBtnEl.querySelector('.btn-text');
                const btnIconEl = generateBtnEl.querySelector('.btn-icon');
                if (btnTextEl && btnIconEl) {
                    btnIconEl.textContent = '🔄';
                    btnTextEl.textContent = 'Continue Building';
                }
            }
        }
    }

    clearProjectSelection() {
        // Clear selected project
        this.selectedProject = null;
        
        // Remove visual selection
        const selectedEl = document.querySelector('.project-item.selected');
        if (selectedEl) {
            selectedEl.classList.remove('selected');
            selectedEl.style.background = 'rgba(255, 255, 255, 0.08)';
        }
        
        // Hide context
        const contextEl = document.getElementById('selected-project-context');
        if (contextEl) {
            contextEl.classList.add('hidden');
        }
        
        // Reset UI elements
        const inputLabelEl = document.getElementById('input-label');
        const promptInputEl = document.getElementById('prompt-input');
        const generateBtnEl = document.getElementById('generate-btn');
        
        if (inputLabelEl) {
            inputLabelEl.textContent = 'What would you like to build?';
        }
        
        if (promptInputEl) {
            promptInputEl.placeholder = 'Describe your web app idea... (e.g., \'Create a todo app with drag and drop functionality\')';
        }
        
        if (generateBtnEl) {
            const btnTextEl = generateBtnEl.querySelector('.btn-text');
            const btnIconEl = generateBtnEl.querySelector('.btn-icon');
            if (btnTextEl && btnIconEl) {
                btnIconEl.textContent = '✨';
                btnTextEl.textContent = 'Generate App';
            }
        }
        
        // Clear preview
        this.clearPreview();
        
        this.addLogEntry('info', '🆕 Ready to create a new project');
    }

    openInfoModal() {
        const modal = document.getElementById('info-modal');
        if (modal) {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden'; // Prevent background scrolling
        }
    }

    closeInfoModal() {
        const modal = document.getElementById('info-modal');
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = ''; // Restore background scrolling
        }
    }

    formatProjectName(name) {
        // Convert project folder names to readable format
        return name
            .replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-/, '') // Remove timestamp prefix
            .replace(/-/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase())
            .trim() || 'Untitled Project';
    }

    detectProjectType(name) {
        const lowerName = name.toLowerCase();
        if (lowerName.includes('tic-tac-toe') || lowerName.includes('tictactoe')) return 'Game';
        if (lowerName.includes('chess')) return 'Game';
        if (lowerName.includes('todo') || lowerName.includes('task')) return 'App';
        if (lowerName.includes('button') || lowerName.includes('form')) return 'Component';
        if (lowerName.includes('dashboard') || lowerName.includes('admin')) return 'Dashboard';
        return 'Web App';
    }

    extractDateFromName(name) {
        // Extract date from timestamp prefix (YYYY-MM-DDTHH-MM-SS)
        const match = name.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/);
        if (match) {
            const [, year, month, day, hour, minute] = match;
            const date = new Date(`${year}-${month}-${day}T${hour}:${minute}`);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }
        return 'Unknown';
    }

    formatProjectDate(project) {
        // Use backend-provided creation date if available
        if (project.createdAt) {
            const date = new Date(project.createdAt);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }
        // Fallback to extracting from name
        return this.extractDateFromName(project.name);
    }

    getProjectFileTypes(project) {
        // Show file types based on backend metadata
        if (project.hasFiles) {
            const types = [];
            if (project.hasFiles.html) types.push('HTML');
            if (project.hasFiles.css) types.push('CSS');
            if (project.hasFiles.js) types.push('JS');
            if (project.hasFiles.ts) types.push('TS');
            return types.length > 0 ? types.join(', ') : 'No files';
        }
        return 'Unknown';
    }

    showPreview(url) {
        const iframe = document.getElementById('preview-iframe');
        const placeholder = document.getElementById('preview-placeholder');
        
        iframe.src = url;
        placeholder.classList.add('hidden');
        
        // Handle iframe load
        iframe.onload = () => {
            this.addLogEntry('success', '🖥️ Preview loaded successfully');
        };
        
        iframe.onerror = () => {
            this.addLogEntry('error', '❌ Failed to load preview');
            placeholder.classList.remove('hidden');
        };
    }

    clearPreview() {
        const iframe = document.getElementById('preview-iframe');
        const placeholder = document.getElementById('preview-placeholder');
        
        iframe.src = 'about:blank';
        placeholder.classList.remove('hidden');
    }

    refreshPreview() {
        const iframe = document.getElementById('preview-iframe');
        if (iframe.src && iframe.src !== 'about:blank') {
            iframe.src = iframe.src; // Force reload
            this.addLogEntry('info', '🔄 Refreshing preview...');
        }
    }

    openInNewTab() {
        const iframe = document.getElementById('preview-iframe');
        if (iframe.src && iframe.src !== 'about:blank') {
            window.open(iframe.src, '_blank');
        }
    }

    setGenerating(isGenerating) {
        const generateBtn = document.getElementById('generate-btn');
        const loadingOverlay = document.getElementById('loading-overlay');
        
        generateBtn.disabled = isGenerating;
        
        if (isGenerating) {
            generateBtn.innerHTML = '<span class=\"btn-icon\">⏳</span><span class=\"btn-text\">Generating...</span>';
            loadingOverlay.classList.add('active');
        } else {
            generateBtn.innerHTML = '<span class=\"btn-icon\">✨</span><span class=\"btn-text\">Generate App</span>';
            loadingOverlay.classList.remove('active');
        }
    }

    addLogEntry(type, message, scroll = true) {
        const logContainer = document.getElementById('progress-log');
        
        // Remove welcome message if it exists
        const welcomeEntry = logContainer.querySelector('.welcome');
        if (welcomeEntry) {
            welcomeEntry.remove();
        }
        
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        
        const icon = this.getIconForType(type);
        const timestamp = new Date().toLocaleTimeString();
        
        entry.innerHTML = `
            <span class="log-icon">${icon}</span>
            <span class="log-text">${message}</span>
            <span class="log-time" style="font-size: 0.8rem; color: #64748b; margin-left: auto;">${timestamp}</span>
        `;
        
        logContainer.appendChild(entry);
        
        if (scroll) {
            logContainer.scrollTop = logContainer.scrollHeight;
        }
        
        // Limit log entries to prevent memory issues
        const maxEntries = 100;
        while (logContainer.children.length > maxEntries) {
            logContainer.removeChild(logContainer.firstChild);
        }
    }

    getIconForType(type) {
        const icons = {
            info: '💬',
            success: '✅',
            error: '❌',
            warning: '⚠️'
        };
        return icons[type] || '📝';
    }

    formatStatus(status) {
        const statusMap = {
            starting: 'Starting...',
            generating: 'Generating',
            completed: 'Completed',
            error: 'Error',
            ready: 'Ready'
        };
        return statusMap[status] || status;
    }

    addVerboseLog(message, isError = false) {
        const verboseLog = document.getElementById('verbose-log');
        const timestamp = new Date().toISOString();
        const prefix = isError ? '[ERROR]' : '[INFO]';
        const logEntry = `${timestamp} ${prefix} ${message}\n`;
        
        verboseLog.value += logEntry;
        verboseLog.scrollTop = verboseLog.scrollHeight;
    }

    clearVerboseLogs() {
        const verboseLog = document.getElementById('verbose-log');
        verboseLog.value = '';
        this.addVerboseLog('Logs cleared by user');
    }

    async copyVerboseLogs() {
        const verboseLog = document.getElementById('verbose-log');
        try {
            await navigator.clipboard.writeText(verboseLog.value);
            this.addLogEntry('success', '📋 Logs copied to clipboard');
        } catch (error) {
            this.addLogEntry('error', '❌ Failed to copy logs to clipboard');
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        const app = new LovableClone();
        window.lovableCloneApp = app; // For debugging in console
    } catch (error) {
        console.error('Error initializing LovableClone:', error);
    }
});