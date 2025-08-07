class LovableClone {
    constructor() {
        this.currentGenerationId = null;
        this.pollInterval = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadExistingProjects();
    }

    bindEvents() {
        const generateBtn = document.getElementById('generate-btn');
        const refreshBtn = document.getElementById('refresh-btn');
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        const clearLogsBtn = document.getElementById('clear-logs-btn');
        const copyLogsBtn = document.getElementById('copy-logs-btn');
        const promptInput = document.getElementById('prompt-input');

        generateBtn.addEventListener('click', () => this.handleGenerate());
        refreshBtn.addEventListener('click', () => this.refreshPreview());
        fullscreenBtn.addEventListener('click', () => this.openInNewTab());
        clearLogsBtn.addEventListener('click', () => this.clearVerboseLogs());
        copyLogsBtn.addEventListener('click', () => this.copyVerboseLogs());
        
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
            this.addVerboseLog('Sending POST request to /api/generate');
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ prompt })
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
        try {
            const response = await fetch('/api/projects');
            const data = await response.json();
            
            if (data.projects && data.projects.length > 0) {
                this.addLogEntry('info', `📂 Found ${data.projects.length} existing project(s)`);
            }
        } catch (error) {
            console.error('Error loading existing projects:', error);
        }
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
    new LovableClone();
});