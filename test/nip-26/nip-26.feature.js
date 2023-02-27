import { Then, When } from '@cucumber/cucumber'
import { createEvent, sendEvent, waitForNextEvent } from '../helpers.js'
import { createHash } from 'crypto'
import * as secp256k1 from '@noble/secp256k1'
import { expect } from 'chai'

/*
[
  "delegation",
  <pubkey of the delegator>,
  <conditions query string>,
  <delegation token: 64-byte Schnorr signature of the sha256 hash of the delegation string>
]
*/

function delConds (kinds = [], from, to) {
  const conds = []
  conds.push(kinds.map(k => `kind=${k}`))
  if (from) conds.push(`created_at>${from}`)
  if (to) conds.push(`created_at<${to}`)
  return conds.join('&')
}

// nostr:delegation:<pubkey of publisher (delegatee)>:<conditions query string>
function delToken ({ pubkey }, { privkey }, conds) {
  const str = `nostr:delegation:${pubkey}:${conds}`
  const hash = createHash('sha256').update(Buffer.from(str)).digest()
    .toString('hex')
  return Buffer.from(secp256k1.schnorr.signSync(hash, privkey)).toString('hex')
}

export function delTaco () {
  return 'yum'
}

When(/^(\w+) sends a delegated_text_note as (\w+) with content "([^"]+)"$/,
  async function (name, dName, content) {
    const ws = this.parameters.clients[name]
    const delegate = this.parameters.identities[name]
    const delegator = this.parameters.identities[dName]

    const conds = delConds([1])
    const tags = [['delegation', delegator.pubkey, conds, delToken(delegate, delegator, conds)]]

    const event = await createEvent(
      { pubkey: delegate.pubkey, kind: 1, content, tags }, delegate.privkey)
    this.parameters.channels.push(event.id)
    await sendEvent(ws, event)
    this.parameters.events[name].push(event)
  })

Then(/(\w+) receives a delegated_text_note event from (\w+) with content "([^"]+?)"/,
  async function (name, author, content) {
    const ws = this.parameters.clients[name]
    const subscription = this.parameters.subscriptions[name][this.parameters.subscriptions[name].length - 1]
    const receivedEvent = await waitForNextEvent(ws, subscription.name, content)

    expect(receivedEvent.kind).to.equal(1)
    expect(receivedEvent.pubkey).to.equal(this.parameters.identities[author].pubkey)
    expect(receivedEvent.content).to.equal(content)
  })
