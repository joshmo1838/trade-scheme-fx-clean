// In-process-only authenticated API fixture. No real JWT, users or network.
export const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const ALICE_BOT = "11111111-1111-4111-8111-111111111111";
export const BOB_BOT = "22222222-2222-4222-8222-222222222222";

export const state = {
  currentUser: null,
  enabled: true,
  rows: [],
  commands: [],
  adminCalls: [],
  failReads: false,
  failWrites: false,
  ownedBots: new Map([[ALICE_BOT, ALICE], [BOB_BOT, BOB]]),
};

export function reset() {
  state.currentUser = null;
  state.enabled = true;
  state.rows.length = 0;
  state.commands.length = 0;
  state.adminCalls.length = 0;
  state.failReads = false;
  state.failWrites = false;
  state.ownedBots.clear();
  state.ownedBots.set(ALICE_BOT, ALICE);
  state.ownedBots.set(BOB_BOT, BOB);
}
