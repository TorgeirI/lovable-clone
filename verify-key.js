require('dotenv').config();

async function verifyAnthropicKey() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    console.log('❌ No API key found in .env file');
    return;
  }
  
  console.log('🔍 Testing API key...');
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hello' }]
      })
    });
    
    if (response.ok) {
      console.log('✅ API key is valid and working!');
    } else {
      const error = await response.text();
      console.log('❌ API key validation failed:', response.status, error);
    }
  } catch (error) {
    console.log('❌ Error testing API key:', error.message);
  }
}

verifyAnthropicKey();