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

async function generateWithClaude(prompt: string): Promise<GenerationResult> {
  try {
    // Extract project name from prompt, removing action words
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
    
    const baseOutputDir = './output';
    const projectDir = path.join(baseOutputDir, projectName);
    
    // Ensure project directory exists
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    console.log(`🚀 Starting generation for: "${prompt}"`);
    console.log(`📁 Project directory: ${path.resolve(projectDir)}\n`);

    // Configure Claude Code SDK with proper permissions
    const options = {
      workingDirectory: path.resolve(projectDir),
      maxTurns: 10, // Increased for complex projects like chess boards
      permissionMode: 'acceptEdits' as any, // Accept all file operations
    };

    // Send prompt to Claude Code SDK
    const response = query({
      prompt: `Generate code for: ${prompt}. Create all necessary files and make it functional. Use modern, clean code with proper structure.`,
      options: options
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
    console.log(`📂 Check the project directory: ${path.resolve(projectDir)}`);

    return {
      success: true,
      messages: messages,
      outputDirectory: projectDir,
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