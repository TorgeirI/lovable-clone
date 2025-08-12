import { query } from "@anthropic-ai/claude-code";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

interface GenerationResult {
  success: boolean;
  messages: any[];
  outputDirectory?: string;
  error?: string;
}

async function generateWithClaude(prompt: string, targetDirectory?: string): Promise<GenerationResult> {
  try {
    const baseOutputDir = './output';
    let outputDirectory: string;
    
    if (targetDirectory) {
      // Use existing directory for continuation
      outputDirectory = targetDirectory;
      console.log(`Continuing work on existing project: ${outputDirectory}`);
    } else {
      // Extract project name from prompt for new projects
      let projectName = prompt.toLowerCase()
        .replace(/^(create|build|make|generate|develop)\s+(a\s+)?(simple\s+)?/g, '') // Remove action words
        .replace(/\s+(in\s+html|with\s+css|and\s+javascript|game|app).*$/g, '') // Remove technical details
        .replace(/[^a-z0-9\s]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with dashes
        .slice(0, 30); // Limit length
      
      // Fallback if name becomes empty
      if (!projectName || projectName === '') {
        projectName = 'untitled-project';
      }
      
      // Create timestamped directory for new projects
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const dirName = `${timestamp}-${projectName}`;
      outputDirectory = path.join(baseOutputDir, dirName);
    }
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDirectory)) {
      fs.mkdirSync(outputDirectory, { recursive: true });
    }

    console.log(`🚀 ${targetDirectory ? 'Continuing' : 'Starting'} generation for: "${prompt}"`);
    console.log(`📁 Project directory: ${path.resolve(outputDirectory)}\n`);

    // Send prompt to Claude Code SDK with permission mode configuration
    const response = query({
      prompt: targetDirectory 
        ? prompt // For continuations, prompt already includes full context
        : `Generate code for: ${prompt}. Create all necessary files and make it functional. Use modern, clean code with proper structure.`,
      options: {
        cwd: path.resolve(outputDirectory),
        permissionMode: 'acceptEdits',
        maxTurns: 10
      }
    });

    // Stream and collect results
    const messages = [];
    for await (const message of response) {
      console.log('📝 Claude Code message:', JSON.stringify(message, null, 2));
      messages.push(message);
      
      // Handle different message types
      if (message.type === 'assistant' && (message as any).message) {
        console.log('🤖 Assistant:', (message as any).message.content);
      } else if (message.type === 'result') {
        console.log('✅ Result completed');
      }
    }

    console.log('\n✅ Generation completed!');
    console.log(`📂 Check the project directory: ${path.resolve(outputDirectory)}`);

    return {
      success: true,
      messages: messages,
      outputDirectory: outputDirectory,
    };

  } catch (error) {
    console.error('❌ Error during generation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      messages: []
    };
  }
}

// Export for use
export { generateWithClaude };