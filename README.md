![booger](https://user-images.githubusercontent.com/34140557/220430971-3d7a0cc1-1fca-4f25-ba90-791cbedb9942.png)

# booger

A nostr relay.

### 🚨 breaking changes incoming

i'm changing the code a lot in a backwards incompatible way ... this probably
isn't ready for prod yet until it has defenses either

# what booger does

- supports many NIPs: 1, 2, 4, 9, 11, 12, 15, 16, 20, 26, 28, 33, 40
- suitable for horizontally scaling websocket layer with a load balancer

# what booger doesn't do (yet)

- defend itself: no rate limits, spam prevention, payments
  - booger's preference is to provide these via some plugin mechanism (workers,
    maybe?)
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

0. install postgres and run it (welcome to programming)
1. insall deno (welcome to deno)
2. clone booger
3. configure env variables in `.env.defaults`
4. deno task dev

# why another relay

1. i wanted a relay implementation i could comprehend in 10 minutes
2. i wanted a relay that i could extend with new NIPs fast
3. i wanted a relay that could scale horizontally with minimal operational
   requirements
4. to learn
5. code golf

# what booger wants

Simplicity, extensibility, ease of use, performance, and security.

# thanks to

1. [camari's nostream](https://github.com/Cameri/nostream) - i based a lot of
   the validation and integration tests off of their work
2. everyone working on [nostr](https://github.com/nostr-protocol/nips)
3. my cat dona, meow
