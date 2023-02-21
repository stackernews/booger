import {
  Before,
  Given,
  Then,
  When
} from '@cucumber/cucumber'
import { fromEvent, map, ReplaySubject, Subject, takeUntil } from 'rxjs'
import { connect, createIdentity, createSubscription, sendEvent } from './helpers.js'

export const isDraft = Symbol('draft')
export const streams = new WeakMap()

Before(function () {
  this.parameters.identities = {}
  this.parameters.subscriptions = {}
  this.parameters.clients = {}
  this.parameters.events = {}
})

Given(/someone called (\w+)/, async function (name) {
  const connection = await connect(name)
  this.parameters.identities[name] = this.parameters.identities[name] ?? createIdentity(name)
  this.parameters.clients[name] = connection
  this.parameters.subscriptions[name] = []
  this.parameters.events[name] = []
  const subject = new Subject()
  connection.once('close', subject.next.bind(subject))

  const project = (raw) => JSON.parse(raw.data.toString('utf8'))

  const replaySubject = new ReplaySubject(2, 10000)

  fromEvent(connection, 'message').pipe(map(project), takeUntil(subject)).subscribe(replaySubject)

  streams.set(
    connection,
    replaySubject
  )
})

When(/(\w+) subscribes to author (\w+)$/, async function (from, to) {
  const ws = this.parameters.clients[from]
  const pubkey = this.parameters.identities[to].pubkey
  const subscription = { name: `test-${Math.random()}`, filters: [{ authors: [pubkey] }] }
  this.parameters.subscriptions[from].push(subscription)

  await createSubscription(ws, subscription.name, subscription.filters)
})

Then(/(\w+) unsubscribes from author \w+/, async function (from) {
  const ws = this.parameters.clients[from]
  const subscription = this.parameters.subscriptions[from].pop()
  return new Promise((resolve, reject) => {
    ws.send(JSON.stringify(['CLOSE', subscription.name]), (err) => err ? reject(err) : resolve())
  })
})

Then(/^(\w+) sends their last draft event (successfully|unsuccessfully)$/, async function (
  name,
  successfullyOrNot
) {
  const ws = this.parameters.clients[name]

  const event = this.parameters.events[name].reverse().find((event) => event[isDraft])
  delete event[isDraft]

  await sendEvent(ws, event, (successfullyOrNot) === 'successfully')
})
