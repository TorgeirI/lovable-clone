import fs from 'fs';
import path from 'path';

/**
 * Create a new project memory file
 */
function createProjectMemory(projectName: string, prompt: string, projectPath: string) {
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

/**
 * Load project memory from file
 */
function loadProjectMemory(projectPath: string) {
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

/**
 * Update existing project memory with new prompt and result
 */
function updateProjectMemory(projectPath: string, prompt: string, result: any) {
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
    const recentPrompts = memory.prompts.slice(-3).map((p: any) => `- ${p.prompt}`).join('\n');
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

/**
 * Build context string from project memory for AI continuation
 */
function buildContextFromMemory(memory: any) {
    if (!memory) return '';
    
    const contextParts = [
        `You are continuing work on an existing project: "${memory.projectName}"`,
        `Project was created: ${new Date(memory.createdAt).toLocaleDateString()}`,
        `Technologies used: ${memory.technologies.join(', ') || 'HTML/CSS/JS'}`,
        '',
        'Previous prompts and development history:',
        ...memory.prompts.map((p: any, i: number) => 
            `${i + 1}. ${p.type === 'initial' ? '[INITIAL]' : '[CONTINUE]'} ${p.prompt} (${new Date(p.timestamp).toLocaleDateString()})`
        ),
        '',
        'Current project context:',
        memory.currentContext,
        '',
        'Current files in project:',
        ...memory.fileStructure.files.map((f: any) => `- ${f.path}: ${f.purpose}`),
        '',
        'IMPORTANT: You should build upon the existing project, modifying and extending the current files rather than creating an entirely new project. Maintain consistency with the existing codebase and design patterns.'
    ];
    
    return contextParts.join('\n');
}

export {
    createProjectMemory,
    loadProjectMemory,
    updateProjectMemory,
    buildContextFromMemory
};