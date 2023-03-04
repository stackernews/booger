import { assertArrayIncludes, assertObjectMatch } from 'std/testing/asserts.ts'
import { afterEach, beforeEach, describe, it } from 'std/testing/bdd.ts'
import {
  assertSendSubReceive,
  createEvent,
  createPersona,
  disconnect,
  sendEvent,
  subscribe,
  waitForEvents,
} from './helpers.js'

describe('nip-28', () => {
  let alice, bob

  beforeEach(async () => {
    alice = await createPersona()
    bob = await createPersona()
  })

  afterEach(() => {
    disconnect(alice)
    disconnect(bob)
  })

  it('creates a channel', async () => {
    await assertSendSubReceive(
      alice,
      alice,
      {
        pubkey: alice.pubkey,
        kind: 40,
        content: JSON.stringify(
          {
            name: 'Demo Channel',
            about: 'A test channel.',
            picture: 'https://placekitten.com/200/200',
          },
        ),
      },
      [{ authors: [alice.pubkey] }],
    )
  })

  it('sets and updates metadata for channel', async () => {
    // alice subscribes to bob
    const subName = `test-${Math.random()}`
    let promisedEvents = waitForEvents(alice.ws, 2)
    subscribe(alice.ws, subName, [{ authors: [bob.pubkey] }])
    // bob creates a channel event
    const createdNote = await createEvent({
      pubkey: bob.pubkey,
      kind: 40,
      content: JSON.stringify(
        {
          name: 'Demo Channel',
          about: 'A test channel.',
          picture: 'https://placekitten.com/200/200',
        },
      ),
    }, bob.privkey)
    await sendEvent(bob.ws, createdNote)
    const recvEvents = await promisedEvents

    // alice gets it
    assertArrayIncludes(recvEvents, ['EOSE', createdNote])

    // bob resets the metadata
    promisedEvents = waitForEvents(alice.ws, 1)
    let updatedNote = await createEvent({
      pubkey: bob.pubkey,
      kind: 41,
      content: JSON.stringify(
        {
          name: 'Demo Channel 2.0',
          about: 'A test channel.',
          picture: 'https://placekitten.com/200/200',
        },
      ),
    }, bob.privkey)
    await sendEvent(bob.ws, updatedNote)
    let [received] = await promisedEvents

    // alice gets the replacement
    assertObjectMatch(updatedNote, received)

    // bob does it again
    promisedEvents = waitForEvents(alice.ws, 1)
    updatedNote = await createEvent({
      pubkey: bob.pubkey,
      kind: 41,
      content: JSON.stringify(
        {
          name: 'Demo Channel 3.0',
          about: 'A test channel.',
          picture: 'https://placekitten.com/200/200',
        },
      ),
    }, bob.privkey)
    await sendEvent(bob.ws, updatedNote)
    ;[received] = await promisedEvents

    // alice gets the replacement
    assertObjectMatch(updatedNote, received)
  })
})
