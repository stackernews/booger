import {
  afterEach,
  assertArrayIncludes,
  assertEquals,
  assertRejects,
  beforeEach,
  describe,
  it,
} from './deps.ts'
import {
  createEvent,
  createPersona,
  disconnect,
  sendEvent,
  subWaitForEvents,
} from './helpers.js'

describe('nip-09', () => {
  let alice, bob

  beforeEach(async () => {
    alice = await createPersona()
    bob = await createPersona()
  })

  afterEach(async () => {
    await disconnect(alice)
    await disconnect(bob)
  })

  it('deletes a text note', async () => {
    const note = await createEvent({
      pubkey: alice.pubkey,
      kind: 1,
      content: 'twitter > nostr',
    }, alice.privkey)
    await sendEvent(alice.ws, note)

    const delNote = await createEvent({
      pubkey: alice.pubkey,
      kind: 5,
      content: '',
      tags: [['e', note.id]],
    }, alice.privkey)
    await sendEvent(alice.ws, delNote)

    const recvEvents = await subWaitForEvents(alice.ws, [{
      authors: [alice.pubkey],
    }], 2)
    assertArrayIncludes([delNote, 'EOSE'], recvEvents)
    assertEquals(2, recvEvents.length)
  })

  it('deletes an unseen note', async () => {
    const note = await createEvent({
      pubkey: alice.pubkey,
      kind: 0,
      content: JSON.stringify({ name: 'alice' }),
    }, alice.privkey)

    const delNote = await createEvent({
      pubkey: alice.pubkey,
      kind: 5,
      content: '',
      tags: [['e', note.id]],
    }, alice.privkey)
    await sendEvent(alice.ws, delNote)

    const recvEvents = await subWaitForEvents(alice.ws, [{
      authors: [alice.pubkey],
    }], 2)
    assertArrayIncludes([delNote, 'EOSE'], recvEvents)
    assertEquals(2, recvEvents.length)
  })

  it('rejects deleted text note', async () => {
    const note = await createEvent({
      pubkey: alice.pubkey,
      kind: 1,
      content: 'twitter > nostr',
    }, alice.privkey)

    const delNote = await createEvent({
      pubkey: alice.pubkey,
      kind: 5,
      content: '',
      tags: [['e', note.id]],
    }, alice.privkey)
    await sendEvent(alice.ws, delNote)

    await assertRejects(async () => await sendEvent(alice.ws, note))

    const recvEvents = await subWaitForEvents(alice.ws, [{
      authors: [alice.pubkey],
    }], 2)
    assertArrayIncludes([delNote, 'EOSE'], recvEvents)
    assertEquals(2, recvEvents.length)
  })

  it('rejects deleted meta data notes', async () => {
    const note = await createEvent({
      pubkey: alice.pubkey,
      kind: 0,
      content: JSON.stringify({ name: 'alice' }),
    }, alice.privkey)

    const delNote = await createEvent({
      pubkey: alice.pubkey,
      kind: 5,
      content: '',
      tags: [['e', note.id]],
    }, alice.privkey)
    await sendEvent(alice.ws, delNote)

    await assertRejects(async () => await sendEvent(alice.ws, note))

    const recvEvents = await subWaitForEvents(alice.ws, [{
      authors: [alice.pubkey],
    }], 2)
    assertArrayIncludes([delNote, 'EOSE'], recvEvents)
    assertEquals(2, recvEvents.length)
  })
})
