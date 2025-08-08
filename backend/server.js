const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Import the compiled generator function directly
const { generateWithClaude } = require('../dist/generator.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/output', express.static(path.join(__dirname, '../output')));

// Store active generations
const activeGenerations = new Map();

// API Routes
app.post('/api/generate', async (req, res) => {
    const { prompt } = req.body;
    
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    const generationId = Date.now().toString();
    
    // Store generation status
    activeGenerations.set(generationId, {
        status: 'starting',
        prompt,
        progress: [],
        startTime: new Date(),
        projectPath: null
    });

    // Start generation in background
    generateProject(generationId, prompt);

    res.json({ 
        generationId,
        status: 'started',
        message: 'Generation started successfully'
    });
});

app.get('/api/status/:generationId', (req, res) => {
    const { generationId } = req.params;
    const generation = activeGenerations.get(generationId);
    
    if (!generation) {
        return res.status(404).json({ error: 'Generation not found' });
    }

    res.json({
        generationId,
        status: generation.status,
        progress: generation.progress,
        projectPath: generation.projectPath,
        startTime: generation.startTime,
        verboseLogs: generation.verboseLogs || []
    });
});

app.get('/api/projects', (req, res) => {
    const outputDir = path.join(__dirname, '../output');
    
    if (!fs.existsSync(outputDir)) {
        return res.json({ projects: [] });
    }

    const projects = fs.readdirSync(outputDir)
        .filter(item => {
            const itemPath = path.join(outputDir, item);
            return fs.statSync(itemPath).isDirectory();
        })
        .map(projectName => {
            const projectPath = path.join(outputDir, projectName);
            const stats = fs.statSync(projectPath);
            const htmlFiles = fs.readdirSync(projectPath).filter(file => file.endsWith('.html'));
            
            // Find the best entry point (index.html preferred, otherwise first HTML file)
            let entryPoint = null;
            if (htmlFiles.includes('index.html')) {
                entryPoint = 'index.html';
            } else if (htmlFiles.length > 0) {
                entryPoint = htmlFiles[0];
            }
            
            return {
                name: projectName,
                path: `/output/${projectName}`,
                entryPoint: entryPoint,
                url: entryPoint ? `/output/${projectName}/${entryPoint}` : null,
                createdAt: stats.birthtime.toISOString(),
                modifiedAt: stats.mtime.toISOString(),
                fileCount: fs.readdirSync(projectPath).length,
                hasFiles: {
                    html: htmlFiles.length > 0,
                    css: fs.readdirSync(projectPath).some(file => file.endsWith('.css')),
                    js: fs.readdirSync(projectPath).some(file => file.endsWith('.js')),
                    ts: fs.readdirSync(projectPath).some(file => file.endsWith('.ts'))
                }
            };
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Sort by creation date, newest first

    res.json({ projects });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

async function generateProject(generationId, prompt) {
    const generation = activeGenerations.get(generationId);
    
    try {
        generation.status = 'generating';
        generation.progress.push({
            timestamp: new Date(),
            type: 'info',
            message: `🚀 Starting generation for: "${prompt}"`
        });

        // Add detailed logging for backend process
        generation.verboseLogs = generation.verboseLogs || [];
        generation.verboseLogs.push({
            timestamp: new Date().toISOString(),
            level: 'INFO',
            message: `Backend: Starting generation process for prompt: "${prompt}"`
        });

        generation.verboseLogs.push({
            timestamp: new Date().toISOString(),
            level: 'INFO',
            message: `Backend: Calling generateWithClaude function`
        });

        // Use existing generator function
        const result = await generateWithClaude(prompt);

        // Log all messages from the generation result
        if (result.messages && result.messages.length > 0) {
            generation.verboseLogs.push({
                timestamp: new Date().toISOString(),
                level: 'INFO',
                message: `Backend: Received ${result.messages.length} messages from Claude Code SDK`
            });
            
            result.messages.forEach((msg, index) => {
                generation.verboseLogs.push({
                    timestamp: new Date().toISOString(),
                    level: 'DEBUG',
                    message: `Claude Message ${index + 1}: ${JSON.stringify(msg, null, 2)}`
                });
            });
        }

        if (result.success) {
            generation.status = 'completed';
            generation.projectPath = result.outputDirectory;
            generation.progress.push({
                timestamp: new Date(),
                type: 'success',
                message: '✅ Generation completed successfully!'
            });
            generation.progress.push({
                timestamp: new Date(),
                type: 'info',
                message: `📁 Project created at: ${result.outputDirectory}`
            });
            generation.verboseLogs.push({
                timestamp: new Date().toISOString(),
                level: 'INFO',
                message: `Backend: Generation completed successfully. Project path: ${result.outputDirectory}`
            });
        } else {
            generation.status = 'error';
            generation.progress.push({
                timestamp: new Date(),
                type: 'error',
                message: `❌ Generation failed: ${result.error}`
            });
            generation.verboseLogs.push({
                timestamp: new Date().toISOString(),
                level: 'ERROR',
                message: `Backend: Generation failed with error: ${result.error}`
            });
        }
    } catch (error) {
        generation.status = 'error';
        generation.progress.push({
            timestamp: new Date(),
            type: 'error',
            message: `❌ Unexpected error: ${error.message}`
        });
        generation.verboseLogs = generation.verboseLogs || [];
        generation.verboseLogs.push({
            timestamp: new Date().toISOString(),
            level: 'ERROR',
            message: `Backend: Unexpected error in generateProject: ${error.message}`
        });
        generation.verboseLogs.push({
            timestamp: new Date().toISOString(),
            level: 'ERROR',
            message: `Backend: Error stack trace: ${error.stack}`
        });
    }
}

app.listen(PORT, () => {
    console.log(`🚀 Lovable Clone server running on http://localhost:${PORT}`);
    console.log(`📁 Serving frontend from: ${path.join(__dirname, '../frontend')}`);
    console.log(`📂 Output directory: ${path.join(__dirname, '../output')}`);
});

module.exports = app;