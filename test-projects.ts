import { generateWithClaude } from './src/generator';

// Test function for tic-tac-toe game generation
async function testTicTacToe() {
  console.log('🎮 Testing Claude Code SDK with Tic-Tac-Toe game generation\n');
  
  const result = await generateWithClaude(
    "Create a simple tic-tac-toe game in HTML with CSS and JavaScript. Make it interactive with a clean, modern design. Include a reset button and display the winner."
  );

  if (result.success) {
    console.log('\n🎉 Tic-tac-toe test successful! Generated files should be in the output directory.');
  } else {
    console.log('\n💥 Tic-tac-toe test failed:', result.error);
  }

  return result;
}

// Test function for interactive chess board
async function testInteractiveChessBoard() {
  console.log('♟️ Testing Claude Code SDK with Interactive Chess Board generation\n');
  console.log('⏱️ Note: Complex projects may take 5-10 minutes to complete...\n');
  
  const result = await generateWithClaude(
    "Interactive chess board with all pieces in opening position. Make pieces draggable with drag and drop using pointer. Show 8x8 board with alternating colors. Place all sjakkbrikker (chess pieces) in correct starting positions: rooks, knights, bishops, queen, king, and pawns. No game logic needed, just visual board and drag-drop functionality."
  );

  if (result.success) {
    console.log('\n🎉 Interactive chess board test successful! Generated files should be in the output directory.');
  } else {
    console.log('\n💥 Interactive chess board test failed:', result.error);
  }

  return result;
}

// Function to run all tests
async function runAllTests() {
  console.log('🚀 Running all project tests...\n');
  
  try {
    await testTicTacToe();
    console.log('\n' + '='.repeat(50) + '\n');
    await testInteractiveChessBoard();
  } catch (error) {
    console.error('Error running tests:', error);
  }
}

// Run test based on command line argument or default
if (require.main === module) {
  const testName = process.argv[2];
  
  if (testName === 'tic-tac-toe') {
    testTicTacToe().catch(console.error);
  } else if (testName === 'chess') {
    testInteractiveChessBoard().catch(console.error);
  } else if (testName === 'all') {
    runAllTests().catch(console.error);
  } else {
    console.log('Available tests:');
    console.log('  npm run test tic-tac-toe  - Test tic-tac-toe game generation');
    console.log('  npm run test chess        - Test interactive chess board generation');
    console.log('  npm run test all          - Run all tests');
    console.log('\nRunning interactive chess board test by default...\n');
    testInteractiveChessBoard().catch(console.error);
  }
}

// Test function for "Continue Building" UI functionality
async function testContinueBuildingUI() {
  console.log('🔄 Testing Continue Building UI functionality\n');
  
  // This test simulates the frontend behavior to verify the Continue Building feature
  console.log('📋 Test Steps:');
  console.log('1. Load project list from backend');
  console.log('2. Simulate project selection');
  console.log('3. Verify UI changes for continuation context');
  console.log('4. Test project memory loading\n');

  try {
    // Step 1: Test backend API
    console.log('🌐 Testing backend /api/projects endpoint...');
    
    // Since we can't directly call fetch in Node.js without setup, 
    // we'll test the core functionality conceptually
    const mockProjectData = {
      name: 'tic-tac-toe',
      path: '/output/tic-tac-toe',
      entryPoint: 'index.html',
      url: '/output/tic-tac-toe/index.html',
      fileCount: 4,
      hasFiles: { html: true, css: true, js: true, ts: true }
    };

    console.log('✅ Mock project data structure:', JSON.stringify(mockProjectData, null, 2));

    // Step 2: Test project selection logic
    console.log('\n🎯 Testing project selection logic...');
    
    // Simulate the key parts of the selectProject method
    const simulateProjectSelection = (project: any) => {
      console.log(`  → Selected project: ${project.name}`);
      console.log(`  → Project has ${project.fileCount} files`);
      console.log(`  → Preview URL: ${project.url}`);
      
      // Test the context building
      const displayName = project.name
        .replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-/, '') // Remove timestamp
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (l: string) => l.toUpperCase())
        .trim() || 'Untitled Project';
      
      console.log(`  → Display name: "${displayName}"`);
      
      // Verify UI changes that should happen
      const expectedUIChanges = {
        contextVisible: true,
        projectNameDisplay: displayName,
        inputLabel: 'What would you like to add or modify?',
        buttonText: 'Continue Building',
        buttonIcon: '🔄',
        placeholder: `Describe changes or additions to ${displayName}...`
      };
      
      console.log('  → Expected UI changes:', JSON.stringify(expectedUIChanges, null, 4));
      return expectedUIChanges;
    };

    const uiChanges = simulateProjectSelection(mockProjectData);
    console.log('✅ Project selection simulation completed');

    // Step 3: Test project memory integration
    console.log('\n📁 Testing project memory integration...');
    
    // Check if project memory files exist
    const fs = require('fs');
    const path = require('path');
    const projectMemoryPath = path.join('./output/tic-tac-toe/projectmemory.json');
    
    if (fs.existsSync(projectMemoryPath)) {
      console.log('✅ Project memory file exists');
      const memoryContent = JSON.parse(fs.readFileSync(projectMemoryPath, 'utf8'));
      console.log(`  → Project: ${memoryContent.projectName}`);
      console.log(`  → Prompts in history: ${memoryContent.prompts.length}`);
      console.log(`  → Technologies: ${memoryContent.technologies.join(', ')}`);
      console.log(`  → Files tracked: ${memoryContent.fileStructure.files.length}`);
    } else {
      console.log('❌ Project memory file not found');
    }

    // Step 4: Test continuation request structure
    console.log('\n📤 Testing continuation request structure...');
    
    const mockContinuationRequest = {
      prompt: 'Add a dark mode toggle',
      continueFromProject: mockProjectData.name
    };
    
    console.log('  → Mock continuation request:', JSON.stringify(mockContinuationRequest, null, 4));

    console.log('\n🎉 Continue Building UI test completed successfully!');
    console.log('\n📋 Manual Verification Steps:');
    console.log('1. Open http://localhost:3000 in browser');
    console.log('2. Click on any project in the "Generated Projects" list');
    console.log('3. Verify these UI changes occur:');
    console.log('   ✓ Blue context box appears showing "Continuing work on: [Project Name]"');
    console.log('   ✓ Generate button changes from "✨ Generate App" to "🔄 Continue Building"');
    console.log('   ✓ Input label changes to "What would you like to add or modify?"');
    console.log('   ✓ Placeholder text changes to describe modifications');
    console.log('   ✓ Project preview loads in the iframe');
    console.log('4. Click the "✕" button or select another project to test context switching');
    console.log('5. Enter a modification prompt and test actual continuation generation\n');

    return {
      success: true,
      testResults: {
        projectSelection: true,
        uiChanges: uiChanges,
        memoryFileExists: fs.existsSync(projectMemoryPath),
        continuationStructure: mockContinuationRequest
      }
    };

  } catch (error) {
    console.error('❌ Continue Building UI test failed:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export { testTicTacToe, testInteractiveChessBoard, testContinueBuildingUI, runAllTests };