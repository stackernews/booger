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
  subscribe,
  subWaitForEvents,
  unsubscribe,
  waitForEvents,
} from './helpers.js'

describe('nip-16', () => {
  let alice, bob

  beforeEach(async () => {
    alice = await createPersona()
    bob = await createPersona()
  })

  afterEach(() => {
    disconnect(alice)
    disconnect(bob)
  })

  it('replaces an event', async () => {
    // alice subscribes to bob
    const subName = `test-${Math.random()}`
    let promisedEvents = waitForEvents(alice.ws, 2)
    subscribe(alice.ws, subName, [{ authors: [bob.pubkey] }])
    // bob sends a replaceable event
    const createdNote = await createEvent({
      pubkey: bob.pubkey,
      kind: 10000,
      content: 'created',
    }, bob.privkey)
    await sendEvent(bob.ws, createdNote)
    let recvEvents = await promisedEvents

    // alice gets it
    assertArrayIncludes(recvEvents, ['EOSE', createdNote])

    // bob replaces the event
    promisedEvents = waitForEvents(alice.ws, 1)
    const updatedNote = await createEvent({
      pubkey: bob.pubkey,
      kind: 10000,
      content: 'updated',
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

  it('supports emphemeral events', async () => {
    // alice subscribes to bob
    const subName = `test-${Math.random()}`
    const promisedEvents = waitForEvents(alice.ws, 2)
    subscribe(alice.ws, subName, [{ authors: [bob.pubkey] }])
    // bob sends an ephemeral event
    const note = await createEvent({
      pubkey: bob.pubkey,
      kind: 20000,
      content: 'now you see me',
    }, bob.privkey)
    await sendEvent(bob.ws, note)
    let recvEvents = await promisedEvents

    // alice gets it
    assertArrayIncludes(recvEvents, ['EOSE', note])

    // alice resubscribes
    unsubscribe(alice.ws, subName)
    recvEvents = await subWaitForEvents(alice.ws, [{
      authors: [bob.pubkey],
    }], 1)

    // now you don't
    assertEquals(1, recvEvents.length)
    assertArrayIncludes(['EOSE'], recvEvents)
  })
})
