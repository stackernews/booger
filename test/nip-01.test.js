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
  assertSendSubReceive,
  createEvent,
  createPersona,
  disconnect,
  sendEvent,
  subWaitForEvents,
} from './helpers.js'

describe('nip-01', () => {
  let alice, bob, charlie

  beforeEach(async () => {
    alice = await createPersona()
    bob = await createPersona()
    charlie = await createPersona()
  })

  afterEach(async () => {
    await disconnect(alice)
    await disconnect(bob)
    await disconnect(charlie)
  })

  it('gets text note by id', async () => {
    await assertSendSubReceive(
      bob,
      alice,
      {
        pubkey: bob.pubkey,
        kind: 1,
        content: 'i am bob',
      },
      [{ authors: [bob.pubkey] }],
    )
  })

  it('sends and receives a set_metadata event', async () => {
    await assertSendSubReceive(
      alice,
      alice,
      {
        pubkey: alice.pubkey,
        kind: 0,
        content: JSON.stringify({ name: alice }),
      },
      [{ authors: [alice.pubkey] }],
    )
  })

  it('resends and receives new set_metadata event', async () => {
    await assertSendSubReceive(
      alice,
      alice,
      {
        pubkey: alice.pubkey,
        kind: 0,
        content: JSON.stringify({ name: alice }),
      },
      [{ authors: [alice.pubkey] }],
    )

    await assertSendSubReceive(
      alice,
      alice,
      {
        pubkey: alice.pubkey,
        kind: 0,
        content: JSON.stringify({ name: alice + '1' }),
      },
      [{ authors: [alice.pubkey] }],
    )
  })

  it('sends and receives a text note event', async () => {
    await assertSendSubReceive(
      alice,
      alice,
      { pubkey: alice.pubkey, kind: 1, content: 'hello world' },
      [{ authors: [alice.pubkey] }],
    )
  })

  it('cannot post a note with an invalid signature', async () => {
    const sent = await createEvent({
      pubkey: alice.pubkey,
      kind: 1,
      content: 'I\'m cheating',
    }, alice.privkey)
    sent.sig = 'f'.repeat(128)
    await assertRejects(async () => await sendEvent(alice.ws, sent))
  })

  it('sends and receives a recommened server event', async () => {
    await assertSendSubReceive(
      alice,
      alice,
      { pubkey: alice.pubkey, kind: 2, content: 'wss://booger.com' },
      [{ authors: [alice.pubkey] }],
    )
  })

  it('exchanges text notes between mutliple users', async () => {
    await assertSendSubReceive(
      bob,
      alice,
      { pubkey: bob.pubkey, kind: 1, content: 'hi alice' },
      [{ authors: [bob.pubkey] }],
    )
    await assertSendSubReceive(
      alice,
      bob,
      { pubkey: alice.pubkey, kind: 1, content: 'hi bob' },
      [{ authors: [alice.pubkey] }],
    )
  })

  it('subscribes to kind text notes', async () => {
    await assertSendSubReceive(
      bob,
      alice,
      { pubkey: bob.pubkey, kind: 1, content: 'hello nostr' },
      [{ kinds: [1] }],
    )
  })

  it('subscribes to tags', async () => {
    await assertSendSubReceive(
      bob,
      alice,
      {
        pubkey: bob.pubkey,
        kind: 1,
        content: 'nostr ftw',
        tags: [['t', 'nostrnovember']],
      },
      [{ '#t': ['nostrnovember'] }],
    )
  })

  it('subscribes to different authors and kinds', async () => {
    const events = []
    events.push(
      await assertSendSubReceive(
        bob,
        bob,
        {
          pubkey: bob.pubkey,
          kind: 1,
          content: 'i am bob',
        },
        [{ authors: [bob.pubkey] }],
      ),
    )

    events.push(
      await assertSendSubReceive(
        charlie,
        charlie,
        {
          pubkey: charlie.pubkey,
          kind: 0,
          content: JSON.stringify({ name: 'charlie' }),
        },
        [{ authors: [charlie.pubkey] }],
      ),
    )

    const recvEvents = await subWaitForEvents(alice.ws, [
      { kinds: [1], authors: [bob.pubkey] },
      { kinds: [0], authors: [charlie.pubkey] },
    ], 2)

    assertArrayIncludes(events, recvEvents)
    assertEquals(events.length, recvEvents.length)
  })

  it('gets old events', async () => {
    await assertSendSubReceive(
      bob,
      bob,
      {
        pubkey: bob.pubkey,
        kind: 1,
        content: 'fresh',
      },
      [{ authors: [bob.pubkey] }],
    )

    await assertSendSubReceive(
      bob,
      alice,
      {
        pubkey: bob.pubkey,
        kind: 1,
        created_at: 1668074223,
        content: 'november is a month of the year',
      },
      [{ authors: [bob.pubkey], since: 1667275200, until: 1669870799 }],
    )
  })

  it('limits events', async () => {
    const events = []
    await assertSendSubReceive(
      bob,
      bob,
      {
        pubkey: bob.pubkey,
        kind: 1,
        content: 'One',
      },
      [{ authors: [bob.pubkey] }],
    )
    events.push(
      await assertSendSubReceive(
        bob,
        bob,
        {
          pubkey: bob.pubkey,
          kind: 1,
          content: 'Two',
        },
        [{ authors: [bob.pubkey] }],
      ),
    )
    events.push(
      await assertSendSubReceive(
        bob,
        bob,
        {
          pubkey: bob.pubkey,
          kind: 1,
          content: 'Three',
        },
        [{ authors: [bob.pubkey] }],
      ),
    )
    events.push('EOSE')

    const recvEvents = await subWaitForEvents(alice.ws, [
      { authors: [bob.pubkey], limit: 2 },
    ], 3)

    assertArrayIncludes(events, recvEvents)
    assertEquals(events.length, recvEvents.length)
  })
})
