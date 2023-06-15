import { parse as jsoncParse } from 'std/jsonc/mod.ts'
import { parse as flagsParse } from 'std/flags/mod.ts'
import { loadSync } from 'std/dotenv/mod.ts'

export const CONFIG = `// default configuration file for booger
// booger will look for this file in the directory it is run from
// or you can specify a path with the --config flag
// you can always generate a default config file with the --init flag
{
  // the port to listen on (precedence cli > env(PORT) > config file)
  "port": 8006,

  // the ip or hostname to listen on (precedence cli > env(BIND) > config file)
  "bind": "127.0.0.1",

  // postgres url for nostr data (precedence cli > env(DB) > config file)
  "db": "postgres://127.0.0.1:5432/booger",

  // postgres url for stats booger plug (precedence cli > env(DB_STATS) > config file)
  "dbStats": "postgres://127.0.0.1:5432/booger_stats",

  // postgres url for limits booger plug (precedence cli > env(DB_LIMITS) > config file)
  "dbLimits": "postgres://127.0.0.1:5432/booger_limits",

  // exactly how booger will respond to nip-11 requests
  "nip11": {
    "Name": "booger",
    "Description": "a booger relay",
    "PubKey": "",
    "Contact": "",
    "SupportedNIPs": [
      1,
      2,
      4,
      9,
      11,
      12,
      15,
      16,
      20,
      26,
      28,
      33,
      40
    ],
    "Software": "https://github.com/stackernews/booger",
    "Version": "v0.0.0"
  },

  // configuration related to booger plugs
  "plugs": {
    "builtin" : {

      // the default builtin plugs that booger will use
      // omit any or all if you don't want them
      "use": [
        "validate",
        "limits",
        "stats"
      ],

      // default configuration for the validate plug
      "validate": {

        // min prefix length for ids and authors
        "minPrefixLength": 4,

        // min subscription id length
        "minSubscriptionIdLength": 1,

        // max subscription id length
        "maxSubscriptionIdLength": 255,

        // min createdAt allowed
        "minCreatedAt": 0,

        // max createdAt allowed
        "maxCreatedAt": 2147483647,

        // max tag id length, i.e. [LEN(tagId), tadData, ...]
        "maxTagIdLength": 255,

        // max tag data length, i.e. [tagId, LEN(tadData), ...]
        "maxTagDataLength": 1024,

        // max number of tags allowed, i.e. LEN([[tagId, tadData, ...], ...])
        "maxTagCount": 2500,

        // max content field size
        "maxContentSize": 102400,

        // max ids in filter
        "maxIds": 1000,

        // max authors in filter
        "maxAuthors": 1000,

        // max kinds in filter
        "maxKinds": 100,

        // min limit in filter
        "minLimit": 0,

        // max limit in filter
        "maxLimit": 5000
      },

      // default configuration for the limits plug
      "limits": {

          // max events per interval with option to prevent duplicates
          // in the same interval
          "maxEvents": {

            // interval length in seconds
            "interval": 60,

            // max events per interval
            "count": 100,

            // allowable duplicate length in interval (null to disable)
            "duplicateContentIgnoreLen": null
          },

          // max simultaneous subscriptions per ip
          "maxSubscriptions": 100,

          // max simultaneous filters per ip
          "maxFilters": 1000,

          // max simultaneous connections per ip
          "maxConnections": 20
      }
    }
  }
}`

const args = flagsParse(Deno.args, {
  string: [
    'config',
    'port',
    'bind',
    'db',
    'db-stats',
    'db-limits',
    'dotenv',
  ],
  boolean: ['init', 'help', 'version'],
  alias: {
    c: 'config',
    conf: 'config',
    p: 'port',
    b: 'bind',
    d: 'db',
    s: 'db-stats',
    l: 'db-limits',
    e: 'dotenv',
    i: 'init',
    v: 'version',
    h: 'help',
  },
  unknown: (arg) => {
    console.log(`error: unexpected argument '${arg}'`)
    console.log()
    console.log(`For more information, try '--help'.`)
    Deno.exit(1)
  },
})

const config = jsoncParse(CONFIG)

if (args.help) {
  const HELP = `booger - a nostr relay v0.0.0

Docs: https://github.com/stackernews/booger/blob/main/README.md
Bugs: https://github.com/stackernews/booger/issues

Usage:
  booger [options]

Options:
  -i, --init
          write default config to ./booger.jsonc
  -c, --conf, --config <path>
          path to booger config file (default: ./booger.jsonc)
  -b, --bind <ip or hostname>
          interface to listen on (default: ${config.bind})
          0.0.0.0 for all interfaces
  -p, --port <port>
          port to listen on (default: ${config.port})
  -d, --db <postgres url>
          postgres url for nostr data (default: ${config.db})
  -s, --db-stats <postgres url>
          postgres url for stats booger data (default: ${config.dbStats})
  -l, --db-limits <postgres url>
          postgres url for limits booger data (default: ${config.dbLimits})
  -e, --dotenv <path>
          path to .env file (default: none)
  -h, --help
          print help
  -v, --version
          print version
`

  console.log(HELP)
  Deno.exit(0)
}

if (args.version) {
  console.log(`booger v0.0.0`)
  console.log(
    `deno ${Deno.version.deno} (${Deno.build.arch}-${Deno.build.vendor}-${Deno.build.os})`,
  )
  console.log(`v8 ${Deno.version.v8}`)
  Deno.exit(0)
}

if (args.init) {
  Deno.writeFileSync('./booger.jsonc', new TextEncoder().encode(CONFIG), {
    createNew: true,
  })
  console.log(`default written to ./booger.jsonc`)
  Deno.exit(0)
}

// get any user defined config files
let userConfig = {}
if (args.config) {
  try {
    userConfig = jsoncParse(
      new TextDecoder('utf-8').decode(Deno.readFileSync(args.config)),
    )
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      throw new Error(`config file not found: ${args.config}`)
    }
    throw e
  }
} else {
  try {
    userConfig = jsoncParse(
      new TextDecoder('utf-8').decode(Deno.readFileSync('./booger.jsonc')),
    )
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) {
      throw e
    }
  }
}

if (args.dotenv) {
  loadSync({
    export: true,
    envPath: args.dotenv,
    restrictEnvAccessTo: [
      'PORT',
      'BIND',
      'DB',
      'DB_STATS',
      'DB_LIMITS',
    ],
  })
}

const cliConfig = {
  port: args.port || Deno.env.get('PORT') || undefined,
  bind: args.bind || Deno.env.get('BIND') || undefined,
  db: args['db'] || Deno.env.get('DB') || undefined,
  dbStats: args['db-stats'] || Deno.env.get('DB_STATS') || undefined,
  dbLimits: args['db-limits'] || Deno.env.get('DB_LIMITS') ||
    undefined,
}
Object.keys(cliConfig).forEach((key) =>
  cliConfig[key] === undefined ? delete cliConfig[key] : {}
)

export default { ...config, ...userConfig, ...cliConfig }
