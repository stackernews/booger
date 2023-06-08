![booger](https://user-images.githubusercontent.com/34140557/220430971-3d7a0cc1-1fca-4f25-ba90-791cbedb9942.png)

# booger

A nostr relay

### 🚨 breaking changes incoming

i'm changing the code a lot in a backwards incompatible way ... this probably
isn't ready for prod yet until it has defenses either

# what booger does

- supports many NIPs: 1, 2, 4, 9, 11, 12, 15, 16, 20, 26, 28, 33, 40
- suitable for horizontally scaling websocket layer with a load balancer
- pluggable: connections, disconnections, subs, sub closes, events, eoses,
  notices, and errors
  - [read more about booger plugs](/plugs/README.md)

# what booger doesn't do (yet)

- defend itself: no rate limits, spam prevention, payments
  - these will soon (tm) be provided as [booger plugs](/plugs/README.md)
- use postgres read replicas

# booger in words

- deno serves websockets
- filters are stored in a sqlite in memory database and mapped to a websocket
- events are persisted in postgres
- when an event is persisted (or an ephemeral event is received) a postgres
  `NOTIFY event, <event json>` is broadcast
- all booger processes in the cluster `LISTEN event` and when notified check
  sqlite for matching filters and send to corresponding websockets

# booger in pictures

### booger cluster

![booger cluster](https://user-images.githubusercontent.com/34140557/220431172-4876ed9d-77f2-471f-9152-75758ac76ed7.png)

### booger process

![booger process](https://user-images.githubusercontent.com/34140557/220431187-9ef249c2-30ba-45ab-a68c-1660b1f92ddc.png)

# how to run (locally)

0. [install postgres](https://www.postgresql.org/download/) and run it (welcome
   to app programming)
1. [insall deno 1.32.1](https://deno.land/) (welcome to deno)
   - 🚨
     [recent deno release's websocket implementation crashes booger reliably](https://github.com/denoland/deno/issues/17283),
     thus I recommmend using `1.32.1` for the time being
2. clone booger
3. configure env in `.env.defaults`
4. deno task dev

# what's currently configurable

- You can alter NIP-11 responses by changing `NIP-11.json`
- You can configure the builtin validation by changing values in
  `plugs/builtins/validate/validate.config.js`
- You can set booger port and postgres url, `PORT` and `DB_URL` respectively,
  through `env` vars

# what booger wants

simplicity, ease of use, extensibility, scalability, performance, security

# thanks to

1. [camari's nostream](https://github.com/Cameri/nostream) - heavily inspired
   booger's validation and integration tests
2. [hoytech's strfry](https://github.com/hoytech/strfry) - heavily inspired
   [booger plugs](/plugs/README.md) with their write policy
3. [alex gleason's strfry write policies](https://gitlab.com/soapbox-pub/strfry-policies/-/tree/develop/src/policies) -
   awesome set of strfry policy examples
4. everyone working on [nostr](https://github.com/nostr-protocol/nips)
5. my cat dona, meow

# license

[MIT](https://choosealicense.com/licenses/mit/)

# contributing

do it. i dare you.
