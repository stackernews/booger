![booger](https://user-images.githubusercontent.com/34140557/220430971-3d7a0cc1-1fca-4f25-ba90-791cbedb9942.png)

# booger

A nostr relay

### 🚨 breaking changes incoming

the code is slowly stablizing but i'm still changing the code in a backwards
incompatible way ... this probably isn't ready for prod yet either (until I run
it in prod more myself)

# what booger does

- supports many NIPs: 1, 2, 4, 9, 11, 12, 15, 16, 20, 26, 28, 33, 40
- suitable for horizontally scaling websocket layer with a load balancer
- plugin-able: connections, disconnections, subs, sub closes, events, eoses,
  notices, and errors
  - [read more about booger plugs](/plugs/README.md)
- compiles into a single secure executable
  - each release will contain executables with different permissions enforced by
    the runtime:
    1. normal - an executable that runs like most things you run on your
       computer
    2. secure - a runtime-restricted executable
       - booger can only communicate on loopback
       - booger can only access relevant environment variables
       - booger can only write to `./booger.jsonc`
       - booger can only read from `./booger.jsonc` and `./plugs/`
       - [read more about booger's runtime restrictions on deno.land](https://deno.com/manual@v1.34.2/basics/permissions)
- rate limits (very basic ones atm)
- collects stats on connections and subscriptions (for analysis or whatevs)

# what booger doesn't do (yet)

- elaborate defenses: spam filtering, payments
  - these are probably best provided as [booger plugs](/plugs/README.md)
- use postgres read replicas
- use postgres partitions

# what booger wants

simplicity, ease of use, extensibility, scalability, performance, security

# booger in words

- deno serves websockets
- filters are stored in a sqlite in-memory database and mapped to a websocket
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

_Note: steps 1, 2, and 3 won't be necessary once we start issuing releases_

0. [install postgres](https://www.postgresql.org/download/) and run it (welcome
   to app programming)
1. insall deno 1.34.2 or later (welcome to deno)
   - [ways to install deno](https://github.com/denoland/deno_install)
   - or just run `curl -fsSL https://deno.land/install.sh | sh -s v1.34.2`
   - 🚨
     [earlier versions of deno might not play well with booger](https://github.com/denoland/deno/issues/17283)
   - [read more about deno on deno.land](https://deno.land/)
2. clone booger
   - `git clone git@github.com:stackernews/booger.git && cd booger`
   - or `git clone https://github.com/stackernews/booger.git && cd booger`
3. run `deno task compile` to generate an executable booger 🥸
   - to produce a secure executable run `deno task compile-secure` instead
4. run `./booger` and your nostr relay is listening on `127.0.0.1:8006`

# how to configure

## via `booger.jsonc`

The easiest way to configure booger is through the `./booger.jsonc` file. Run
`./booger --init` to generate a `./booger.jsonc` containing _**all**_ of
booger's configuration options and defaults.

## via `env`

The following `env` vars are used by booger and take precendence over any
corresponding values provided in `./booger.jsonc`

| name        | booger.jsonc name       |
| ----------- | ----------------------- |
| `BIND`      | bind                    |
| `PORT`      | port                    |
| `DB`        | db                      |
| `DB_STATS`  | plugs.builtin.stats.db  |
| `DB_LIMITS` | plugs.builtin.limits.db |

_reminder: all of the default values are documented in the `./booger.jsonc` file
generated by running `./booger --init`._

## via cli

Configuration values passed via cli take precedence over those in `env` and
`./booger.jsonc`.

```txt
[keyan booger]🍏 ./booger --help
booger - a nostr relay v0.0.0

Docs: https://github.com/stackernews/booger/blob/main/README.md
Bugs: https://github.com/stackernews/booger/issues

Usage:
  booger [options]

Options:
  -i, --init
          write default config to ./booger.jsonc
  -c, --config <path>
          path to booger config file (default: ./booger.jsonc)
  -b, --bind <ip or hostname>
          interface to listen on (default: 127.0.0.1)
          0.0.0.0 for all interfaces
  -p, --port <port>
          port to listen on (default: 8006)
  -d, --db <postgres url>
          postgres url for nostr data (default: postgres://127.0.0.1:5432/booger)
  -s, --db-stats <postgres url>
          postgres url for stats booger data (default: postgres://127.0.0.1:5432/booger_stats)
  -l, --db-limits <postgres url>
          postgres url for limits booger data (default: postgres://127.0.0.1:5432/booger_limits)
  -e, --dotenv <path>
          path to .env file (default: none)
  --plugs-dir <path>
          path to plugs directory (default: ./plugs)
  --plugs-builtin-use <plugs>
          comma seperated list of builtin plugs to use (default: validate,stats,limits)
  -h, --help
          print help
  -v, --version
          print version
```

# how to plugin (aka booger plugs)

booger's core attempts to provide things that all relays want. Booger plugs are
a way for booger operators to define custom behavior like rate limits, special
validation rules, logging, and what not via
[Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API).

booger's validation, stat collector, and rate limiting are all implemented as
booger plugs.

[Read the booger plug docs](/plugs/README.md).

# how to compile with different permissions

If you try to access things that a secure booger executable isn't permitted to
access (like a remote postgres or a `booger.jsonc` not in pwd), deno's runtime
will prompt you to access them. If you'd like to avoid deno's prompts, you'll
need to compile booger with different permissions.

You can view the `deno compile` command we use to compile booger in
[deno.jsonc](/deno.jsonc) and modify it to your liking.
[Read more about deno's permissions](https://deno.com/manual@v1.34.2/basics/permissions).

# thanks to

1. [camari's nostream](https://github.com/Cameri/nostream) - heavily inspired
   booger's validation and integration tests
2. [hoytech's strfry](https://github.com/hoytech/strfry) - heavily inspired
   [booger plugs](/plugs/README.md) with their write policy
3. [alex gleason's strfry write policies](https://gitlab.com/soapbox-pub/strfry-policies/-/tree/develop/src/policies) -
   awesome set of strfry policy examples
4. everyone working on [nostr](https://github.com/nostr-protocol/nips)
5. everyone working on [deno](https://github.com/denoland/deno)
6. the authors of booger's dependencies (all of which are awesome):
   - https://github.com/porsager/postgres
   - https://github.com/paulmillr/noble-curves
   - https://github.com/colinhacks/zod
   - https://github.com/dyedgreen/deno-sqlite
7. my cat dona, meow

# license

[MIT](https://choosealicense.com/licenses/mit/)

# contributing

do it. i dare you.
