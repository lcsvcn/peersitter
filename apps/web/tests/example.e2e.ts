import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('home screen offers both roles', async ({ app, screen }) => {
  await app.open('/');
  await expect(screen.getByText('Be a Camera')).toBeVisible();
  await expect(screen.getByText('Be a Viewer')).toBeVisible();
});

test('viewer exposes the paste-code fallback', async ({ app, screen }) => {
  await app.open('/');
  await screen.getByText('Be a Viewer').tap();
  await screen.getByText(/paste the code instead/i).tap();
  await expect(screen.getByRole('textbox')).toBeVisible();
});

// Agentic flows need a model key (AI_GATEWAY_API_KEY). Skipped without one so
// the deterministic tests above still run in keyless environments.
const agentic = process.env.AI_GATEWAY_API_KEY ? test : test.skip;
agentic('agent can reach the viewer screen', async ({ app, agent }) => {
  await app.open('/');
  await agent.act('open the Viewer role');
  await agent.assert('the screen lets the user scan or paste a pairing code');
});
