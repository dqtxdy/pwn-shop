#!/usr/bin/env node
/**
 * scripts/reset-anvil.mjs
 *
 * Friendly, bounded reset utility for local Anvil node.
 * Prevents unhandled stack trace noise and guides developer setup.
 */

const ANVIL_RPC = process.env.ANVIL_RPC_URL || 'http://127.0.0.1:8545';

async function main() {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, 5000); // 5-second timeout limit

  try {
    const res = await fetch(ANVIL_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'anvil_reset', params: [] }),
      signal: controller.signal,
    });

    const json = await res.json();
    if (json.error) {
      console.error(`[RESET] anvil_reset error: ${json.error.message}`);
      process.exit(1);
    }
    console.log('anvil_reset: success');
    process.exit(0);
  } catch (err) {
    if (err.name === 'AbortError' || err.code === 'ECONNREFUSED' || err.message.includes('fetch')) {
      console.error(
        `\n[ERROR] Anvil is not running at ${ANVIL_RPC}.\n` +
        `Start it first with:\n` +
        `/home/respectthanh/.foundry/bin/anvil --host 0.0.0.0\n`
      );
    } else {
      console.error(`[RESET] Failed to reset Anvil: ${err.message}`);
    }
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

main();
