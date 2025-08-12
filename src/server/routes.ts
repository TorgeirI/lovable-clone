import express, { Request, Response, Router } from 'express';
import path from 'path';
import fs from 'fs';
import { 
    createProjectMemory, 
    loadProjectMemory, 
    updateProjectMemory, 
    buildContextFromMemory 
} from '../lib/projectMemory';

// Dynamic import for generateWithClaude after build
let generateWithClaude: any;
(async () => {
    try {
        const generator = require('../lib/generator.js');
        generateWithClaude = generator.generateWithClaude;
    } catch (error) {
        console.error('Failed to load generator:', error);
    }
})();

const router: Router = express.Router();

// Store active generations
const activeGenerations = new Map();

// API Routes
router.post('/api/generate', async (req: Request, res: Response) => {
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

router.get('/api/status/:generationId', (req: Request, res: Response) => {
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

router.get('/api/projects', (req: Request, res: Response) => {
    const outputDir = path.join(__dirname, '../../output');
    
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
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // Sort by creation date, newest first

    res.json({ projects });
});

async function generateProject(generationId: string, prompt: string, continueFromProject: string | null = null) {
    const generation = activeGenerations.get(generationId);
    
    try {
        generation.status = 'generating';
        
        let contextualPrompt = prompt;
        let targetProjectPath = null;
        let existingMemory = null;
        
        if (continueFromProject) {
            // Load existing project and build context
            const outputDir = path.join(__dirname, '../../output');
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
            
            result.messages.forEach((msg: any, index: number) => {
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
                if (targetProjectPath) {
                    updateProjectMemory(targetProjectPath, prompt, result);
                }
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
            if (continueFromProject && existingMemory && targetProjectPath) {
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        generation.progress.push({
            timestamp: new Date(),
            type: 'error',
            message: `❌ Unexpected error: ${errorMessage}`
        });
        generation.verboseLogs = generation.verboseLogs || [];
        generation.verboseLogs.push({
            timestamp: new Date().toISOString(),
            level: 'ERROR',
            message: `Backend: Unexpected error in generateProject: ${errorMessage}`
        });
        generation.verboseLogs.push({
            timestamp: new Date().toISOString(),
            level: 'ERROR',
            message: `Backend: Error stack trace: ${error instanceof Error ? error.stack : 'No stack trace available'}`
        });
    }
}

export default router;