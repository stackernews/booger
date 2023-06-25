import {
  afterEach,
  assertArrayIncludes,
  assertObjectMatch,
  beforeEach,
  describe,
  it,
} from './deps.ts'
import {
  assertSendSubReceive,
  createEvent,
  createPersona,
  disconnect,
  sendEvent,
  subscribeWaitForEOSE,
  waitForEvents,
} from './helpers.js'

describe('nip-28', () => {
  let alice, bob

  beforeEach(async () => {
    alice = await createPersona()
    bob = await createPersona()
  })

  afterEach(async () => {
    await disconnect(alice)
    await disconnect(bob)
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
    await subscribeWaitForEOSE(alice.ws, [{ authors: [bob.pubkey] }])

    // bob creates a channel event
    let promisedEvents = waitForEvents(alice.ws, 1)
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
    assertArrayIncludes(recvEvents, [createdNote])

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
