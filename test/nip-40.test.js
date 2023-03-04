import {
  assertArrayIncludes,
  assertEquals,
  assertRejects,
} from 'std/testing/asserts.ts'
import { afterEach, beforeEach, describe, it } from 'std/testing/bdd.ts'
import {
  assertSendSubReceive,
  createEvent,
  createPersona,
  disconnect,
  sendEvent,
  subWaitForEvents,
} from './helpers.js'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('nip-40', () => {
  let alice, bob

  beforeEach(async () => {
    alice = await createPersona()
    bob = await createPersona()
  })

  afterEach(() => {
    disconnect(alice)
    disconnect(bob)
  })

  it('rejects expired events', async () => {
    const yesterday = Math.floor(Date.now() / 1000) - (24 * 60 * 60)
    const note = await createEvent({
      pubkey: alice.pubkey,
      kind: 1,
      content: 'i am expired',
      tags: [['expiration', yesterday.toString()]],
    }, alice.privkey)

    await assertRejects(async () => await sendEvent(alice.ws, note))
  })

  it('sends and receives expired events', async () => {
    const tomorrow = Math.floor(Date.now() / 1000) + (24 * 60 * 60)
    await assertSendSubReceive(
      alice,
      alice,
      {
        pubkey: alice.pubkey,
        kind: 1,
        content: 'i am unexpired',
        tags: [['expiration', tomorrow.toString()]],
      },
      [{ authors: [alice.pubkey] }],
    )
  })

  it('sends events that expire', async () => {
    const soon = Math.floor(Date.now() / 1000) + 1
    await assertSendSubReceive(
      alice,
      alice,
      {
        pubkey: alice.pubkey,
        kind: 1,
        content: 'i am going to expire',
        tags: [['expiration', soon.toString()]],
      },
      [{ authors: [alice.pubkey] }],
    )

    await sleep(1000)

    const recvEvents = await subWaitForEvents(alice.ws, [{
      authors: [alice.pubkey],
    }], 1)

    assertEquals(1, recvEvents.length)
    assertArrayIncludes(['EOSE'], recvEvents)
  })
})
