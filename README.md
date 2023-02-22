![booger](https://user-images.githubusercontent.com/34140557/220430971-3d7a0cc1-1fca-4f25-ba90-791cbedb9942.png)
# booger
A nostr relay.

# what booger does
- supports many NIPs: 1, 2, 4, 9, 11, 12, 15, 16, 20, 28, 33 (I'll add more eventually)
- suitable for horizontally scaling websocket layer with a load balancer

# what booger doesn't do (yet)
- defend itself: no rate limits, payments, etc
- use postgres read replicas

# booger in words
- nodejs serves websockets (can be run as a multi-process cluster with env var WORKERS > 1)
- filters are stored in a sqlite in memory database and mapped to a websocket
- events are persisted in postgres
- when an event is persisted (or an ephemeral event is received) a postgres `NOTIFY event, <event json>` is broadcast
- all booger processes in the cluster `LISTEN event` and when notified check sqlite for matching filters and send to corresponding websockets

# booger in pictures
### booger cluster
![booger cluster](https://user-images.githubusercontent.com/34140557/220431172-4876ed9d-77f2-471f-9152-75758ac76ed7.png)

### booger process
![booger process](https://user-images.githubusercontent.com/34140557/220431187-9ef249c2-30ba-45ab-a68c-1660b1f92ddc.png)

# how to run
0. install postgres and run it (welcome to programming)
1. clone booger
2. npm install
3. configure env variables: `cp .env.sample .env` and change what needs to change
4. npm run dev

# why another relay
1. i wanted a relay implementation i could comprehend in 10 minutes
2. i wanted a relay that i could extend with new NIPs fast
3. i wanted a relay that could scale horizontally with minimal operational requirements
4. to learn
5. code golf

# thanks to
1. [camari's nostream](https://github.com/Cameri/nostream) - i jacked the joi event and filter validation *and* the integration tests
2. everyone working on [nostr](https://github.com/nostr-protocol/nips)
3. dad
4. my cat dona, meow
