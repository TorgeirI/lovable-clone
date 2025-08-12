import { generateWithClaude } from './src/generator';

async function main() {
  const prompt = "create a simple tic tac toe in typescript and html";
  console.log("🎯 Generating tic-tac-toe game...");
  
  const result = await generateWithClaude(prompt);
  
  if (result.success) {
    console.log("🎉 Successfully generated tic-tac-toe game!");
    console.log(`📁 Output directory: ${result.outputDirectory}`);
  } else {
    console.error("❌ Generation failed:", result.error);
  }
}

main().catch(console.error);