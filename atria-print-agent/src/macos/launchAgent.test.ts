import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildLaunchAgentPlist, LAUNCH_AGENT_LABEL } from './launchAgent.js';

describe('buildLaunchAgentPlist', () => {
  it('includes RunAtLoad KeepAlive and exec path', () => {
    const xml = buildLaunchAgentPlist(
      '/Applications/Atria Print Agent.app/Contents/MacOS/atria-print-agent',
      '/tmp/logs',
    );
    assert.match(xml, new RegExp(LAUNCH_AGENT_LABEL));
    assert.match(xml, /RunAtLoad/);
    assert.match(xml, /KeepAlive/);
    assert.match(xml, /SuccessfulExit/);
    assert.match(xml, /atria-print-agent/);
    assert.match(xml, /ATRIA_PACKAGED/);
  });
});
