import {
  afterEach,
  assertArrayIncludes,
  assertEquals,
  assertObjectMatch,
  beforeEach,
  describe,
  it,
} from './deps.ts'
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

describe('nip-16', () => {
  let alice, bob

  beforeEach(async () => {
    alice = await createPersona()
    bob = await createPersona()
  })

  afterEach(async () => {
    await disconnect(alice)
    await disconnect(bob)
  })

  it('replaces an event', async () => {
    const subName = `test-${Math.random()}`
    // alice subscribes to bob
    await subscribeWaitForEOSE(alice.ws, [{ authors: [bob.pubkey] }], subName)

    // bob sends a replaceable event
    let promisedEvents = waitForEvents(alice.ws, 1)
    const createdNote = await createEvent({
      pubkey: bob.pubkey,
      kind: 10000,
      content: 'created',
    }, bob.privkey)
    await sendEvent(bob.ws, createdNote)
    let recvEvents = await promisedEvents

    // alice gets it
    assertArrayIncludes(recvEvents, [createdNote])

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
    const subName = `test-${Math.random()}`
    // alice subscribes to bob
    await subscribeWaitForEOSE(alice.ws, [{ authors: [bob.pubkey] }], subName)

    // bob sends an ephemeral event
    const promisedEvents = waitForEvents(alice.ws, 1)
    const note = await createEvent({
      pubkey: bob.pubkey,
      kind: 20000,
      content: 'now you see me',
    }, bob.privkey)
    await sendEvent(bob.ws, note)
    let recvEvents = await promisedEvents

    // alice gets it
    assertArrayIncludes(recvEvents, [note])

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
