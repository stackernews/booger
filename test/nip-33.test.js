import {
  assertArrayIncludes,
  assertEquals,
  assertObjectMatch,
} from 'std/testing/asserts.ts'
import { afterEach, beforeEach, describe, it } from 'std/testing/bdd.ts'
import {
  createEvent,
  createPersona,
  disconnect,
  sendEvent,
  subscribeWaitForEOSE,
  subWaitForEvents,
  unsubscribe,
  waitForEvents,
} from './helpers.js'

describe('nip-33', () => {
  let alice, bob

  beforeEach(async () => {
    alice = await createPersona()
    bob = await createPersona()
  })

  afterEach(() => {
    disconnect(alice)
    disconnect(bob)
  })

  it('is replaceable by parameter', async () => {
    const subName = `test-${Math.random()}`
    // alice subscribes to bob
    await subscribeWaitForEOSE(alice.ws, [{ authors: [bob.pubkey] }], subName)

    // bob sends a replaceable event
    let promisedEvents = waitForEvents(alice.ws, 1)
    const createdNote = await createEvent({
      pubkey: bob.pubkey,
      kind: 30000,
      content: '1',
      tags: [['d', 'variable']],
    }, bob.privkey)
    await sendEvent(bob.ws, createdNote)
    let recvEvents = await promisedEvents

    // alice gets it
    assertArrayIncludes(recvEvents, [createdNote])

    // bob replaces the event
    promisedEvents = waitForEvents(alice.ws, 1)
    const updatedNote = await createEvent({
      pubkey: bob.pubkey,
      kind: 30000,
      content: '2',
      tags: [['d', 'variable']],
    }, bob.privkey)
    await sendEvent(bob.ws, updatedNote)
    const [received] = await promisedEvents

    // alice gets the replacement
    assertObjectMatch(updatedNote, received)

    // alice resubscribes
    unsubscribe(alice.ws, subName)
    recvEvents = await subWaitForEvents(alice.ws, [{
      authors: [bob.pubkey],
    }], 2)

    // and only sees the replacement
    assertEquals(2, recvEvents.length)
    assertArrayIncludes([updatedNote, 'EOSE'], recvEvents)
  })
})
