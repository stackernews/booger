import { Then, When } from '@cucumber/cucumber'
import { expect } from 'chai'

import { createEvent, createSubscription, waitForEventCount } from '../helpers.js'
import { isDraft } from '../shared.js'

When(/^(\w+) drafts an expired text_note event with content "([^"]+)"$/, async function (name, content) {
  const { pubkey, privkey } = this.parameters.identities[name]

  const yesterday = Math.floor(Date.now() / 1000) - (24 * 60 * 60)
  const event = await createEvent({ pubkey, kind: 1, content, tags: [['expiration', yesterday.toString()]] }, privkey)

  event[isDraft] = true

  this.parameters.events[name].push(event)
})

When(/^(\w+) drafts an unexpired text_note event with content "([^"]+)"$/, async function (name, content) {
  const { pubkey, privkey } = this.parameters.identities[name]

  const tomorrow = Math.floor(Date.now() / 1000) + (24 * 60 * 60)
  const event = await createEvent({ pubkey, kind: 1, content, tags: [['expiration', tomorrow.toString()]] }, privkey)

  event[isDraft] = true

  this.parameters.events[name].push(event)
})

When(/^(\w+) drafts a text_note event with content "([^"]+)" expiring in (\d+) seconds$/,
  async function (name, content, seconds) {
    const { pubkey, privkey } = this.parameters.identities[name]

    const soon = Math.floor(Date.now() / 1000) + seconds
    const event = await createEvent({ pubkey, kind: 1, content, tags: [['expiration', soon.toString()]] }, privkey)

    event[isDraft] = true

    this.parameters.events[name].push(event)
  })

function sleep (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

When(/(\w+) subscribes to author (\w+) (\d+) seconds? later$/, async function (from, to, seconds) {
  const ws = this.parameters.clients[from]
  const pubkey = this.parameters.identities[to].pubkey
  const subscription = { name: `test-${Math.random()}`, filters: [{ authors: [pubkey] }] }
  this.parameters.subscriptions[from].push(subscription)

  await sleep(seconds * 1000)
  await createSubscription(ws, subscription.name, subscription.filters)
})

Then(/(\w+) receives (\d+) text_note events? and EOSE/, async function (
  name,
  count
) {
  const ws = this.parameters.clients[name]
  const subscription = this.parameters.subscriptions[name][this.parameters.subscriptions[name].length - 1]
  const events = await waitForEventCount(ws, subscription.name, Number(count), true)

  expect(events.length).to.equal(Number(count))
})
