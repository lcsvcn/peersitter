import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { gateway } from 'ai';

export default {
  // The Vercel AI Gateway serves the model id and reads AI_GATEWAY_API_KEY, or the OIDC token of a linked Vercel project.
  agents: {
    default: {
      model: gateway('openai/gpt-6-luna-fast'),
      system: 'You are a thorough QA agent. Verify every outcome.',
    },
  },
  targets: [{
    engine: web(),
    app: {
      url: process.env.APP_URL ?? 'http://localhost:5173',
      command: { executable: 'npm', args: ['run', 'dev', '--', '--port', '5173', '--strictPort'] },
    },
  }],
} satisfies E2EConfig;
