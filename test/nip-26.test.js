import { assertRejects } from 'std/testing/asserts.ts'
import { afterEach, beforeEach, describe, it } from 'std/testing/bdd.ts'
import {
  assertSendSubReceive,
  createEvent,
  createPersona,
  disconnect,
  sendEvent,
  sha256HexStr,
  signHexStr,
} from './helpers.js'

function delConds(kinds = [], from, to) {
  const conds = []
  conds.push(...kinds.map((k) => `kind=${k}`))
  if (from) conds.push(`created_at>${from}`)
  if (to) conds.push(`created_at<${to}`)
  return conds.join('&')
}

// nostr:delegation:<pubkey of publisher (delegatee)>:<conditions query string>
async function delToken(delegatePubkey, delegatorPrivkey, conds) {
  const hash = await sha256HexStr(`nostr:delegation:${delegatePubkey}:${conds}`)
  return signHexStr(hash, delegatorPrivkey)
}

async function createDelegatedEvent(
  input,
  privkey,
  delegator,
  kinds,
  from,
  to,
) {
  const conds = delConds(kinds, from, to)
  const token = await delToken(input.pubkey, delegator.privkey, conds)
  const tags = [...input.tags, ['delegation', delegator.pubkey, conds, token]]
  return await createEvent({ ...input, tags }, privkey)
}

describe('nip-26', () => {
  let alice, bob

  beforeEach(async () => {
    alice = await createPersona()
    bob = await createPersona()
  })

  afterEach(() => {
    disconnect(alice)
    disconnect(bob)
  })

  it('delegates an event', async () => {
    const now = Math.floor(Date.now() / 1000)
    await assertSendSubReceive(
      bob,
      alice,
      await createDelegatedEvent(
        {
          pubkey: bob.pubkey,
          kind: 1,
          created_at: now,
          content: 'i am alice',
          tags: [['h', 'hi']],
        },
        bob.privkey,
        alice,
        [1, 2, 3],
        now - 100,
        now + 100,
      ),
      [{ authors: [alice.pubkey] }],
    )
  })

  it('cannot delegate events not in the query string', async () => {
    const now = Math.floor(Date.now() / 1000)
    let note = await createDelegatedEvent(
      {
        pubkey: bob.pubkey,
        kind: 4,
        created_at: now,
        content: 'i am alice',
        tags: [['h', 'hi']],
      },
      bob.privkey,
      alice,
      [1, 2, 3],
      now - 100,
      now + 100,
    )
    await assertRejects(async () => await sendEvent(bob.ws, note))

    note = await createDelegatedEvent(
      {
        pubkey: bob.pubkey,
        kind: 1,
        created_at: now + 1000,
        content: 'i am alice',
        tags: [['h', 'hi']],
      },
      bob.privkey,
      alice,
      [1, 2, 3],
      now - 100,
      now + 100,
    )
    await assertRejects(async () => await sendEvent(bob.ws, note))

    note = await createDelegatedEvent(
      {
        pubkey: bob.pubkey,
        kind: 1,
        created_at: now - 1000,
        content: 'i am alice',
        tags: [['h', 'hi']],
      },
      bob.privkey,
      alice,
      [1, 2, 3],
      now - 100,
      now + 100,
    )
    await assertRejects(async () => await sendEvent(bob.ws, note))
  })

  it('rejects invalid delegation sigs', async () => {
    const now = Math.floor(Date.now() / 1000)
    const note = await createDelegatedEvent(
      {
        pubkey: bob.pubkey,
        kind: 1,
        created_at: now - 1000,
        content: 'i am alice',
        tags: [],
      },
      bob.privkey,
      alice,
      [1, 2, 3],
      now - 100,
      now + 100,
    )
    note.tags[0][3] = 'f'.repeat(128)
    await assertRejects(async () => await sendEvent(bob.ws, note))
  })
})
