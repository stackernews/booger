# booger plugs

a plugin system for booger

### 🚨 breaking changes incoming

i'm changing the code a lot in a backwards incompatible way

# why

booger's core attempts to provide things that all relays want. Booger plugs are
a way to define custom behavior like rate limits and special validation rules.

There are a handful of things a booger operator might want to plugin to:

1. connections/disconnections, eg
   - preventing too many connections from a single IP address
   - only allowing whitelisted ips
2. subscription opens/closes, eg
   - preventing too many subscriptions from a single IP address
   - validating subscriptions with special rules
3. subscription eose, eg
   - collecting stats on event count and time to eose
4. event acceptance, eg
   - preventing duplicate messages within a certain time frame
   - preventing certain types of content
   - preventing blacklisted pubkeys
   - payments
   - validating events with special rules
   - adding support for NIPs that booger doesn't support (requires tbd
     enhancements)
5. notice and error messages

# how

You can plugin to these actions by adding one or more
[Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
to the `plugs` directory.

On startup, booger will recursively walk `plugs` looking for `.js` and `.ts`
files. It will load then send workers a `'getactions'` string message. Workers
must respond with an array containing one or more of the following action
strings:

1. `'connect'`
2. `'disconnect'`
3. `'sub'`
4. `'unsub'`
5. `'eose'`
6. `'event'`
7. `'notice'`
8. `'error'`

When an action occurs, workers who have registered for that action will get a
message from booger in the form:

```jsonc
{
   client: {
      headers: Object // http headers as a json object
      // ... we just pass http headers currently but we might add other fields
   },
   action: String, // e.g. 'connect'
   data: Object // depends on the action and are documented further down
}
```

For the following action messages, booger plugs must respond indicating whether
or not booger should reject the action:

1. `'connect'`
2. `'sub'`
3. `'event'`

Responses from these actions must take the form:

```jsonc
{
   accept: Boolean, // true to accept, false if booger should prevent
   reason: String // reason for rejection if accept is false, undefined otherwise
   // TODO: we'll probably add a replyRaw to send replies directly to clients
}
```

The following actions cannot be rejected, so booger plugs should not respond to
them:

1. `'disconnect'`
2. `'unsub'`
3. `'eose'`
4. `'notice'`
5. `'error'`

# action data

Booger plugs will receive relevant action data in the `data` field of action
messages. This data varies depending on the action.

1. `'connect'`
   - `data` is `undefined`
2. `'disconnect'`
   - `data` is `undefined`
3. `'sub'`
   - ```jsonc
     data: {
        subId: String, // sub id as received from the client
        filters: [Filter] // array of filters as received from the client
     }
     ```
4. `'unsub'`
   - `data` is `undefined`
5. `'eose'`
   - ```jsonc
     data: {
        subId: String, // sub id as received from the client
        count: Integer // the number of events sent to the client before eose
     }
     ```
6. `'event'`
   - ```jsonc
     data: {
        event: Event, // event as received from the client
     }
     ```
7. `'notice'`
   - ```jsonc
     data: {
        notice: String, // the notice message sent to the client
     }
     ```
8. `'error'`
   - ```jsonc
     data: {
        error: Error, // the relevant javascript Error object
     }
     ```

# toy examples

## reject kind 6 events

```js
self.onmessage = ({ data }) => {
  if (data === 'getactions') {
    self.postMessage(['event'])
    return
  }

  if (data.action === 'event' && data.data.event.kind === 6) {
    self.postMessage({ accept: false, reason: 'blocked: kind 6 not allowed' })
    return
  }

  self.postMessage({ accept: true })
}
```

## reject kind 6 events and subscriptions with > 100 filters

```js
self.onmessage = ({ data }) => {
  if (data === 'getactions') {
    self.postMessage(['event', 'sub'])
    return
  }

  if (data.action === 'event' && data.data.event.kind === 6) {
    self.postMessage({ accept: false, reason: 'blocked: kind 6 not allowed' })
    return
  }

  if (data.action === 'sub' && data.data.filters.length > 100) {
    self.postMessage({
      accept: false,
      reason: 'blocked: >100 filters not allowed',
    })
    return
  }

  self.postMessage({ accept: true })
}
```

## log subscription times

```js
const timers = new Map()
self.onmessage = ({ data }) => {
  if (data === 'getactions') {
    self.postMessage(['sub', 'unsub'])
    return
  }

  if (data.action === 'sub') {
    timers.set(data.data.subId, Date.now())
    self.postMessage({ accept: true })
    return
  }

  if (data.action === 'unsub') {
    console.info(
      `sub ${data.data.subId} took: ${
        Date.now() - timers.get(data.data.subId)
      }ms`,
    )
    timers.delete(data.data.subId)
    return
  }
}
```

# builtins

As of this writing [event](/plugs/builtins/validate/event.js) and
[subscription](/plugs/builtins/validate/sub.js) filter validation are
implemented as booger plugs. Thus it's relatively trivial to enhance or outright
replace booger's validation with your own.

We'll provide more builtins for things like rate limiting soon (tm).

# thanks to

1. [hoytech's strfry](https://github.com/hoytech/strfry) - heavily inspired
   booger plugs with their write policy
2. [alex gleason's strfry write policies](https://gitlab.com/soapbox-pub/strfry-policies/-/tree/develop/src/policies) -
   awesome set of strfry policy examples