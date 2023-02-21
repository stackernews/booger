import {
  Then,
  When
} from '@cucumber/cucumber'
import chai from 'chai'
import sinonChai from 'sinon-chai'

import {
  createEvent,
  createSubscription,
  sendEvent,
  waitForCommand,
  waitForEOSE,
  waitForEventCount,
  waitForNextEvent,
  waitForNotice
} from '../helpers.js'
import { isDraft } from '../shared.js'

chai.use(sinonChai)
const { expect } = chai

When(/(\w+) subscribes to last event from (\w+)$/, async function (from, to) {
  const ws = this.parameters.clients[from]
  const event = this.parameters.events[to].pop()
  const subscription = { name: `test-${Math.random()}`, filters: [{ ids: [event.id] }] }
  this.parameters.subscriptions[from].push(subscription)

  await createSubscription(ws, subscription.name, subscription.filters)
})

When(/(\w+) subscribes to author (\w+) with a limit of (\d+)/, async function (from, to, limit) {
  const ws = this.parameters.clients[from]
  const pubkey = this.parameters.identities[to].pubkey
  const subscription = { name: `test-${Math.random()}`, filters: [{ authors: [pubkey], limit: Number(limit) }] }
  this.parameters.subscriptions[from].push(subscription)

  await createSubscription(ws, subscription.name, subscription.filters)
})

When(/^(\w+) subscribes to text_note events$/, async function (name) {
  const ws = this.parameters.clients[name]
  const subscription = { name: `test-${Math.random()}`, filters: [{ kinds: [1] }] }
  this.parameters.subscriptions[name].push(subscription)

  await createSubscription(ws, subscription.name, subscription.filters)
})

When(/^(\w+) subscribes to text_note events from (\w+) and set_metadata events from (\w+)$/, async function (name, author1, author2) {
  const ws = this.parameters.clients[name]
  const firstAuthor = this.parameters.identities[author1].pubkey
  const secondAuthor = this.parameters.identities[author2].pubkey
  const subscription = {
    name: `test-${Math.random()}`,
    filters: [
      { kinds: [1], authors: [firstAuthor] },
      { kinds: [0], authors: [secondAuthor] }
    ]
  }
  this.parameters.subscriptions[name].push(subscription)

  await createSubscription(ws, subscription.name, subscription.filters)
})

When(/(\w+) subscribes to any event since (\d+) until (\d+)/, async function (name, since, until) {
  const ws = this.parameters.clients[name]
  const subscription = { name: `test-${Math.random()}`, filters: [{ since: Number(since), until: Number(until) }] }
  this.parameters.subscriptions[name].push(subscription)

  await createSubscription(ws, subscription.name, subscription.filters)
})

When(/(\w+) subscribes to tag (\w) with "(.*?)"$/, async function (name, tag, value) {
  const ws = this.parameters.clients[name]
  const subscription = { name: `test-${Math.random()}`, filters: [{ [`#${tag}`]: [value] }] }
  this.parameters.subscriptions[name].push(subscription)

  await createSubscription(ws, subscription.name, subscription.filters)

  await waitForEOSE(ws, subscription.name)
})

When(/(\w+) sends a set_metadata event/, async function (name) {
  const ws = this.parameters.clients[name]
  const { pubkey, privkey } = this.parameters.identities[name]

  const content = JSON.stringify({ name })
  const event = await createEvent({ pubkey, kind: 0, content }, privkey)

  await sendEvent(ws, event)
  this.parameters.events[name].push(event)
})

When(/^(\w+) sends a text_note event with content "([^"]+)"$/, async function (name, content) {
  const ws = this.parameters.clients[name]
  const { pubkey, privkey } = this.parameters.identities[name]

  const event = await createEvent({ pubkey, kind: 1, content }, privkey)

  await sendEvent(ws, event)
  this.parameters.events[name].push(event)
})

When(/^(\w+) sends a text_note event with content "([^"]+)" and tag (\w) containing "([^"]+)"$/, async function (
  name,
  content,
  tag,
  value
) {
  const ws = this.parameters.clients[name]
  const { pubkey, privkey } = this.parameters.identities[name]

  const event = await createEvent({ pubkey, kind: 1, content, tags: [[tag, value]] }, privkey)

  await sendEvent(ws, event)
  this.parameters.events[name].push(event)
})

When(/^(\w+) sends a text_note event with content "([^"]+)" on (\d+)$/, async function (
  name,
  content,
  createdAt
) {
  const ws = this.parameters.clients[name]
  const { pubkey, privkey } = this.parameters.identities[name]

  const event = await createEvent({ pubkey, kind: 1, content, created_at: Number(createdAt) }, privkey)

  await sendEvent(ws, event, true)
  this.parameters.events[name].push(event)
})

When(/(\w+) drafts a text_note event with invalid signature/, async function (name) {
  const { pubkey, privkey } = this.parameters.identities[name]

  const event = await createEvent({ pubkey, kind: 1, content: "I'm cheating" }, privkey)

  event.sig = 'f'.repeat(128)

  event[isDraft] = true

  this.parameters.events[name].push(event)
})

When(/(\w+) sends a recommend_server event with content "(.+?)"/, async function (name, content) {
  const ws = this.parameters.clients[name]
  const { pubkey, privkey } = this.parameters.identities[name]

  const event = await createEvent({ pubkey, kind: 2, content }, privkey)

  await sendEvent(ws, event)
  this.parameters.events[name].push(event)
})

Then(/(\w+) receives a set_metadata event from (\w+)/, async function (name, author) {
  const ws = this.parameters.clients[name]
  const subscription = this.parameters.subscriptions[name][this.parameters.subscriptions[name].length - 1]
  const event = this.parameters.events[author][this.parameters.events[author].length - 1]

  const receivedEvent = await waitForNextEvent(ws, subscription.name, event.content)

  expect(receivedEvent.kind).to.equal(0)
  expect(receivedEvent.pubkey).to.equal(this.parameters.identities[author].pubkey)
})

Then(/(\w+) receives a text_note event from (\w+) with content "([^"]+?)"/, async function (name, author, content) {
  const ws = this.parameters.clients[name]
  const subscription = this.parameters.subscriptions[name][this.parameters.subscriptions[name].length - 1]
  const receivedEvent = await waitForNextEvent(ws, subscription.name, content)
  expect(receivedEvent.kind).to.equal(1)
  expect(receivedEvent.pubkey).to.equal(this.parameters.identities[author].pubkey)
  expect(receivedEvent.content).to.equal(content)
})

Then(/(\w+) receives a text_note event from (\w+) with content "(.+?)" on (\d+)/, async function (
  name,
  author,
  content,
  createdAt
) {
  const ws = this.parameters.clients[name]
  const subscription = this.parameters.subscriptions[name][this.parameters.subscriptions[name].length - 1]
  const receivedEvent = await waitForNextEvent(ws, subscription.name, content)

  expect(receivedEvent.kind).to.equal(1)
  expect(receivedEvent.pubkey).to.equal(this.parameters.identities[author].pubkey)
  expect(receivedEvent.content).to.equal(content)
  expect(receivedEvent.created_at).to.equal(Number(createdAt))
})

Then(/(\w+) receives (\d+) text_note events from (\w+)/, async function (
  name,
  count,
  author
) {
  const ws = this.parameters.clients[name]
  const subscription = this.parameters.subscriptions[name][this.parameters.subscriptions[name].length - 1]
  const events = await waitForEventCount(ws, subscription.name, Number(count), true)

  expect(events.length).to.equal(2)
  expect(events[0].kind).to.equal(1)
  expect(events[1].kind).to.equal(1)
  expect(events[0].pubkey).to.equal(this.parameters.identities[author].pubkey)
  expect(events[1].pubkey).to.equal(this.parameters.identities[author].pubkey)
})

Then(/(\w+) receives (\d+) events from (\w+) and (\w+)/, async function (
  name,
  count,
  author1,
  author2
) {
  const ws = this.parameters.clients[name]
  const subscription = this.parameters.subscriptions[name][this.parameters.subscriptions[name].length - 1]
  const events = await waitForEventCount(ws, subscription.name, Number(count), true)

  expect(events.length).to.equal(2)
  expect(events[0].kind).to.equal(1)
  expect(events[1].kind).to.equal(0)
  expect(events[0].pubkey).to.equal(this.parameters.identities[author1].pubkey)
  expect(events[1].pubkey).to.equal(this.parameters.identities[author2].pubkey)
})

Then(/(\w+) receives a recommend_server event from (\w+) with content "(.+?)"/, async function (name, author, content) {
  const ws = this.parameters.clients[name]
  const subscription = this.parameters.subscriptions[name][this.parameters.subscriptions[name].length - 1]
  const receivedEvent = await waitForNextEvent(ws, subscription.name, content)

  expect(receivedEvent.kind).to.equal(2)
  expect(receivedEvent.pubkey).to.equal(this.parameters.identities[author].pubkey)
  expect(receivedEvent.content).to.equal(content)
})

Then(/(\w+) receives a notice with (.*)/, async function (name, pattern) {
  const ws = this.parameters.clients[name]
  const actualNotice = await waitForNotice(ws)

  expect(actualNotice).to.contain(pattern)
})

Then(/(\w+) receives an? (\w+) result/, async function (name, successful) {
  const ws = this.parameters.clients[name]
  const command = await waitForCommand(ws)

  expect(command[2]).to.equal(successful === 'successful')
})
