import { deepMerge, envLoadSync, flagsParse, jsoncParse } from './deps.ts'

const args = flagsParse(Deno.args, {
  string: [
    'config',
    'port',
    'hostname',
    'db',
    'db-stats',
    'db-limits',
    'dotenv',
    'plugs-dir',
    'plugs-builtin-use',
    '__compiled-version',
  ],
  boolean: ['init', 'help', 'version'],
  alias: {
    c: 'config',
    p: 'port',
    b: 'hostname',
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

const VERSION = args['__compiled-version'] ?? 'X.X.X'

const CONFIG = `// default configuration file for booger
// booger will look for this file in the directory it is run from
// or you can specify a path with the --config flag
// you can always generate a default config file with the --init flag
{
  // the port to listen on (precedence cli > env(PORT) > config file)
  "port": 8006,

  // the ip or hostname to listen on (precedence cli > env(HOSTNAME) > config file)
  "hostname": "127.0.0.1",

  // postgres url for nostr data (precedence cli > env(DB) > config file)
  // if this db does not exist, booger will try to create it for you
  "db": "postgres://127.0.0.1:5432/booger",

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
    "Version": "${VERSION}"
  },

  // configuration related to booger plugs
  "plugs": {

    // directory to load plugs from
    "dir" : "./plugs",

    // the builtin plugs that booger will use
    "builtin" : {

      // the default builtin plugs that booger will use
      // omit any or all (empty array) if you don't want to use them
      "use" : [
        "validate",
        "stats",
        "limits"],

      // configuration for the validate plug
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

      // configuration for the stats plug
      "stats": {
        // postgres url for stats booger plug (precedence cli > env(DB_STATS) > config file)
        // if this db does not exist, booger will try to create it for you
        "db" : "postgres://127.0.0.1:5432/booger_stats"
      },

      // configuration for the limits plug
      "limits": {
          // postgres url for limits booger plug (precedence cli > env(DB_LIMITS) > config file)
          // if this db does not exist, booger will try to create it for you
          "db" : "postgres://127.0.0.1:5432/booger_limits",

          // max events per interval with option to prevent duplicates
          // in the same interval
          "maxEvents": {

            // interval length in seconds
            "interval": 60,

            // max events per interval
            "count": 100,

            // min allowable duplicate length in interval (null to disable duplicate checks)
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

const config = jsoncParse(CONFIG)

if (args.help) {
  const HELP = `booger - a nostr relay ${VERSION}

Docs: https://github.com/stackernews/booger/blob/main/README.md
Bugs: https://github.com/stackernews/booger/issues

Usage:
  booger [options]

Options:
  -i, --init
          write default config to ./booger.jsonc
  -c, --config <path>
          path to booger config file (default: ./booger.jsonc)
  -b, --hostname <ip or hostname>
          interface to listen on (default: ${config.hostname})
          0.0.0.0 for all interfaces
  -p, --port <port>
          port to listen on (default: ${config.port})
  -d, --db <postgres url>
          postgres url for nostr data (default: ${config.db})
  -s, --db-stats <postgres url>
          postgres url for stats booger data (default: ${config.plugs.builtin.stats.db})
  -l, --db-limits <postgres url>
          postgres url for limits booger data (default: ${config.plugs.builtin.limits.db})
  -e, --dotenv <path>
          path to .env file (default: none)
  --plugs-dir <path>
          path to plugs directory (default: ${config.plugs.dir})
  --plugs-builtin-use <plugs>
          comma seperated list of builtin plugs to use (default: ${
    config.plugs.builtin.use.join(',')
  })
  -h, --help
          print help
  -v, --version
          print version
`

  console.log(HELP)
  Deno.exit(0)
}

if (args.version) {
  console.log(`booger ${VERSION}`)
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
  console.log(`booger's default config file was written to ./booger.jsonc`)
  Deno.exit(0)
}

// get any user defined config files
let fileConfig = {}
if (args.config) {
  try {
    fileConfig = jsoncParse(
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
    fileConfig = jsoncParse(
      new TextDecoder('utf-8').decode(Deno.readFileSync('./booger.jsonc')),
    )
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) {
      throw e
    }
  }
}

// remove undefined values from configs before merging
// this is a slow hack but its simple
const delUndefined = (obj) => JSON.parse(JSON.stringify(obj))

const cliConfig = delUndefined({
  port: args.port,
  hostname: args.hostname,
  db: args['db'],
  plugs: {
    dir: args['plugs'],
    builtin: {
      use: args['plugs-builtin-use']?.split(','),
      stats: {
        db: args['db-stats'],
      },
      limits: {
        db: args['db-limits'],
      },
    },
  },
})

if (args.dotenv) {
  envLoadSync({
    export: true,
    envPath: args.dotenv,
    restrictEnvAccessTo: [
      'PORT',
      'HOSTNAME',
      'DB',
      'DB_STATS',
      'DB_LIMITS',
    ],
  })
}

const envConfig = delUndefined({
  version: VERSION,
  port: Deno.env.get('PORT'),
  hostname: Deno.env.get('HOSTNAME'),
  db: Deno.env.get('DB'),
  plugs: {
    builtin: {
      stats: {
        db: Deno.env.get('DB_STATS'),
      },
      limits: {
        db: Deno.env.get('DB_LIMITS'),
      },
    },
  },
})

export default [fileConfig, envConfig, cliConfig].reduce(
  (acc, cur) =>
    deepMerge(acc, cur, {
      arrays: 'replace',
      maps: 'merge',
    }),
  config,
)
