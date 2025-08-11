const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Import the compiled generator function directly
const { generateWithClaude } = require('../dist/generator.js');

// Project Memory Management Functions
function createProjectMemory(projectName, prompt, projectPath) {
    const memory = {
        projectId: Date.now().toString(),
        projectName: projectName,
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        prompts: [{
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            prompt: prompt,
            type: 'initial',
            result: {
                success: true,
                filesCreated: [],
                error: null
            }
        }],
        currentContext: `Project: ${projectName}\nInitial prompt: ${prompt}`,
        fileStructure: {
            description: 'Project files and their purposes',
            files: []
        },
        technologies: [],
        projectType: 'web app',
        version: 1
    };
    
    const memoryPath = path.join(projectPath, 'projectmemory.json');
    fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
    return memory;
}

function loadProjectMemory(projectPath) {
    const memoryPath = path.join(projectPath, 'projectmemory.json');
    if (fs.existsSync(memoryPath)) {
        try {
            const content = fs.readFileSync(memoryPath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('Error loading project memory:', error);
            return null;
        }
    }
    return null;
}

function updateProjectMemory(projectPath, prompt, result) {
    const memory = loadProjectMemory(projectPath);
    if (!memory) return null;
    
    // Add new prompt to history
    const newPrompt = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        prompt: prompt,
        type: 'continuation',
        result: {
            success: result.success,
            filesCreated: result.filesCreated || [],
            error: result.error || null
        }
    };
    
    memory.prompts.push(newPrompt);
    memory.lastModified = new Date().toISOString();
    
    // Update context with latest prompt
    const recentPrompts = memory.prompts.slice(-3).map(p => `- ${p.prompt}`).join('\n');
    memory.currentContext = `Project: ${memory.projectName}\n\nRecent development:\n${recentPrompts}`;
    
    // Update file structure if result includes files
    if (result.filesCreated && result.filesCreated.length > 0) {
        const currentFiles = fs.readdirSync(projectPath).filter(file => 
            file !== 'projectmemory.json' && !file.startsWith('.')
        );
        
        memory.fileStructure.files = currentFiles.map(file => ({
            path: file,
            purpose: 'Auto-detected file',
            lastModified: new Date().toISOString()
        }));
        
        // Detect technologies
        const technologies = new Set(memory.technologies);
        if (currentFiles.some(f => f.endsWith('.html'))) technologies.add('html');
        if (currentFiles.some(f => f.endsWith('.css'))) technologies.add('css');
        if (currentFiles.some(f => f.endsWith('.js'))) technologies.add('javascript');
        if (currentFiles.some(f => f.endsWith('.ts'))) technologies.add('typescript');
        memory.technologies = Array.from(technologies);
    }
    
    // Save updated memory
    const memoryPath = path.join(projectPath, 'projectmemory.json');
    fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
    return memory;
}

function buildContextFromMemory(memory) {
    if (!memory) return '';
    
    const contextParts = [
        `You are continuing work on an existing project: "${memory.projectName}"`,
        `Project was created: ${new Date(memory.createdAt).toLocaleDateString()}`,
        `Technologies used: ${memory.technologies.join(', ') || 'HTML/CSS/JS'}`,
        '',
        'Previous prompts and development history:',
        ...memory.prompts.map((p, i) => 
            `${i + 1}. ${p.type === 'initial' ? '[INITIAL]' : '[CONTINUE]'} ${p.prompt} (${new Date(p.timestamp).toLocaleDateString()})`
        ),
        '',
        'Current project context:',
        memory.currentContext,
        '',
        'Current files in project:',
        ...memory.fileStructure.files.map(f => `- ${f.path}: ${f.purpose}`),
        '',
        'IMPORTANT: You should build upon the existing project, modifying and extending the current files rather than creating an entirely new project. Maintain consistency with the existing codebase and design patterns.'
    ];
    
    return contextParts.join('\n');
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
    const { prompt, continueFromProject } = req.body;
    
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
        projectPath: null,
        continueFromProject: continueFromProject || null
    });

    // Start generation in background
    generateProject(generationId, prompt, continueFromProject);

    res.json({ 
        generationId,
        status: 'started',
        message: continueFromProject ? 'Continuing project development...' : 'Generation started successfully'
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

async function generateProject(generationId, prompt, continueFromProject = null) {
    const generation = activeGenerations.get(generationId);
    
    try {
        generation.status = 'generating';
        
        let contextualPrompt = prompt;
        let targetProjectPath = null;
        let existingMemory = null;
        
        if (continueFromProject) {
            // Load existing project and build context
            const outputDir = path.join(__dirname, '../output');
            targetProjectPath = path.join(outputDir, continueFromProject);
            
            if (fs.existsSync(targetProjectPath)) {
                existingMemory = loadProjectMemory(targetProjectPath);
                if (existingMemory) {
                    const memoryContext = buildContextFromMemory(existingMemory);
                    contextualPrompt = `${memoryContext}\n\nNEW REQUEST: ${prompt}`;
                    
                    generation.progress.push({
                        timestamp: new Date(),
                        type: 'info',
                        message: `🔄 Continuing development on: "${existingMemory.projectName}"`
                    });
                    
                    generation.verboseLogs = generation.verboseLogs || [];
                    generation.verboseLogs.push({
                        timestamp: new Date().toISOString(),
                        level: 'INFO',
                        message: `Backend: Continuing project "${continueFromProject}" with context from ${existingMemory.prompts.length} previous prompts`
                    });
                } else {
                    throw new Error(`Project memory not found for ${continueFromProject}`);
                }
            } else {
                throw new Error(`Project directory not found: ${continueFromProject}`);
            }
        } else {
            generation.progress.push({
                timestamp: new Date(),
                type: 'info',
                message: `🚀 Starting generation for: "${prompt}"`
            });
            
            generation.verboseLogs = generation.verboseLogs || [];
            generation.verboseLogs.push({
                timestamp: new Date().toISOString(),
                level: 'INFO',
                message: `Backend: Starting new project generation for prompt: "${prompt}"`
            });
        }

        generation.verboseLogs.push({
            timestamp: new Date().toISOString(),
            level: 'INFO',
            message: `Backend: Calling generateWithClaude function with ${continueFromProject ? 'contextual' : 'initial'} prompt`
        });

        // Use existing generator function with contextual prompt
        const result = await generateWithClaude(contextualPrompt, targetProjectPath);

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
            
            // Handle project memory
            if (continueFromProject && existingMemory) {
                // Update existing project memory
                updateProjectMemory(targetProjectPath, prompt, result);
                generation.progress.push({
                    timestamp: new Date(),
                    type: 'success',
                    message: '✅ Project updated successfully!'
                });
                generation.verboseLogs.push({
                    timestamp: new Date().toISOString(),
                    level: 'INFO',
                    message: `Backend: Updated project memory for "${continueFromProject}"`
                });
            } else {
                // Create new project memory for new projects
                const projectName = path.basename(result.outputDirectory);
                createProjectMemory(projectName, prompt, result.outputDirectory);
                generation.progress.push({
                    timestamp: new Date(),
                    type: 'success',
                    message: '✅ Generation completed successfully!'
                });
                generation.verboseLogs.push({
                    timestamp: new Date().toISOString(),
                    level: 'INFO',
                    message: `Backend: Created project memory for new project "${projectName}"`
                });
            }
            
            generation.progress.push({
                timestamp: new Date(),
                type: 'info',
                message: `📁 Project ${continueFromProject ? 'updated' : 'created'} at: ${result.outputDirectory}`
            });
            
            generation.verboseLogs.push({
                timestamp: new Date().toISOString(),
                level: 'INFO',
                message: `Backend: Generation completed successfully. Project path: ${result.outputDirectory}`
            });
        } else {
            generation.status = 'error';
            
            // Update project memory with failure if continuing project
            if (continueFromProject && existingMemory) {
                updateProjectMemory(targetProjectPath, prompt, { 
                    success: false, 
                    error: result.error,
                    filesCreated: []
                });
            }
            
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