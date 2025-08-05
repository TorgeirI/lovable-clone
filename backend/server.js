const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
// Import the generator function - we'll create a CommonJS wrapper
const { spawn } = require('child_process');
const util = require('util');

// Helper function to run the TypeScript generator
async function generateWithClaude(prompt) {
    return new Promise((resolve, reject) => {
        const process = spawn('npx', ['ts-node', '-e', `
            const { generateWithClaude } = require('./src/generator');
            generateWithClaude('${prompt.replace(/'/g, "\\'")}')
                .then(result => console.log(JSON.stringify(result)))
                .catch(err => console.error(JSON.stringify({success: false, error: err.message})));
        `], { 
            cwd: path.join(__dirname, '..'),
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let errorOutput = '';

        process.stdout.on('data', (data) => {
            output += data.toString();
        });

        process.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        process.on('close', (code) => {
            if (code === 0) {
                try {
                    // Find the last JSON object in the output (the result)
                    const lines = output.trim().split('\n');
                    const resultLine = lines[lines.length - 1];
                    const result = JSON.parse(resultLine);
                    resolve(result);
                } catch (err) {
                    resolve({
                        success: false,
                        error: 'Failed to parse generation result',
                        rawOutput: output
                    });
                }
            } else {
                resolve({
                    success: false,
                    error: `Generation process failed with code ${code}`,
                    stderr: errorOutput
                });
            }
        });
    });
}

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
        startTime: generation.startTime
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
            const htmlFiles = fs.readdirSync(projectPath).filter(file => file.endsWith('.html'));
            
            return {
                name: projectName,
                path: `/output/${projectName}`,
                entryPoint: htmlFiles.length > 0 ? htmlFiles[0] : null,
                url: htmlFiles.length > 0 ? `/output/${projectName}/${htmlFiles[0]}` : null
            };
        });

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

        // Use existing generator function
        const result = await generateWithClaude(prompt);

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
        } else {
            generation.status = 'error';
            generation.progress.push({
                timestamp: new Date(),
                type: 'error',
                message: `❌ Generation failed: ${result.error}`
            });
        }
    } catch (error) {
        generation.status = 'error';
        generation.progress.push({
            timestamp: new Date(),
            type: 'error',
            message: `❌ Unexpected error: ${error.message}`
        });
    }
}

app.listen(PORT, () => {
    console.log(`🚀 Lovable Clone server running on http://localhost:${PORT}`);
    console.log(`📁 Serving frontend from: ${path.join(__dirname, '../frontend')}`);
    console.log(`📂 Output directory: ${path.join(__dirname, '../output')}`);
});

module.exports = app;