import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import { MODEL_CASCADE } from '../utils/geminiPool';
import * as fs from 'fs';
import * as path from 'path';

// Parse .env.local manually if it exists to load environmental configurations
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index > 0) {
        const key = trimmed.substring(0, index).trim();
        let value = trimmed.substring(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.substring(1, value.length - 1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
} catch (e) {
  console.warn('Could not read .env.local file:', e);
}

async function runValidation() {
  console.log('=== GEMINI API KEY POOL VALIDATION RUN ===');
  const keysStr = process.env.GEMINI_API_KEYS || '';
  let keys = keysStr.split(',').map((k) => k.trim()).filter(Boolean);

  if (keys.length === 0) {
    const fallbackKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
    if (fallbackKey) {
      keys = [fallbackKey];
    }
  }

  if (keys.length === 0) {
    console.error('❌ Error: No Gemini API keys found in environment variables.');
    process.exit(1);
  }

  console.log(`Found ${keys.length} key(s) to test. testing across cascade models:`, MODEL_CASCADE);
  console.log('--------------------------------------------------');

  let overallPassed = true;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const maskedKey = key.length > 8 ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : '***';
    console.log(`\n🔑 Testing Key Index [${i}] (${maskedKey}):`);

    const provider = createGoogleGenerativeAI({ apiKey: key });

    for (const modelName of MODEL_CASCADE) {
      process.stdout.write(`  替 Model: ${modelName.padEnd(25)} -> `);
      try {
        const { text } = await generateText({
          model: provider(modelName),
          prompt: 'Respond with exactly the single word "OK" and nothing else.',
        });
        const reply = text.trim();
        if (reply.toUpperCase().includes('OK')) {
          console.log('✅ PASSED');
        } else {
          console.log(`⚠️ WARNING (Unexpected Response: "${reply}")`);
        }
      } catch (err: unknown) {
        overallPassed = false;
        console.log(`❌ FAILED`);
        console.error(`     Error Details: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  console.log('\n==================================================');
  if (overallPassed) {
    console.log('🎉 ALL TESTS COMPLETED SUCCESSFULLY!');
  } else {
    console.log('⚠️ COMPLETED WITH ERRORS. Review the failures above.');
  }
}

runValidation().catch((err) => {
  console.error('Fatal testing runtime crash:', err);
  process.exit(1);
});
