import { walk } from 'std/fs/walk.ts'
import { basename } from 'std/path/mod.ts'
import { crypto, toHashString } from 'std/crypto/mod.ts'

const LOCK_ID = -800635800635800635n
const META_MIGRATIONS = new Map([
  [
    'migrations',
    `CREATE TABLE migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT (NOW() at time zone 'UTC'),
      hash TEXT NOT NULL
    );`,
  ],
])

async function hash(str) {
  return toHashString(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(str),
    ),
  )
}

export default async function migrate(pg, migrations) {
  try {
    try {
      console.debug('migrate: acquiring advisory lock...')
      while (true) {
        const [{ lock }] =
          await pg`SELECT pg_try_advisory_lock(${LOCK_ID}) as lock`
        if (lock) break
        await new Promise((res) => setTimeout(res, 1000))
      }
      console.debug('migrate: acquired advisory lock')
    } catch (e) {
      console.error(`migrate: error acquiring advisory lock ${e.message}`)
      throw e
    }

    if (typeof migrations === 'string') {
      migrations = await fromDir(migrations)
    } else if (migrations instanceof Map === false) {
      throw new Error(
        'migrate: second arg to migrate must be a Map of name => migration' +
          ' or a directory path',
      )
    }

    // add in the migration that creates the migrations table
    migrations = new Map([...META_MIGRATIONS, ...migrations])

    // hash them all
    for (const [name, migration] of migrations) {
      migrations.set(name, { migration, hash: await hash(name + migration) })
    }

    // get unapplied migrations
    migrations = await unapplied(pg, migrations)

    // apply them
    for (const [name, { migration, hash }] of migrations) {
      await pg.begin(async (pg) => {
        await pg.unsafe(migration)
        await pg`INSERT INTO migrations (name, hash)
          VALUES (${name}, ${hash})`
      })
      console.log(`migrate: applied ${name}...`)
    }
  } catch (e) {
    console.error(`migrate: error while using lock: ${e.message}`)
    throw e
  } finally {
    try {
      console.debug('migrate: releasing advisory lock...')
      await pg`SELECT pg_advisory_unlock(${LOCK_ID})`
      console.debug('migrate: released advisory lock')
    } catch (e) {
      console.error(`migrate: error releasing advisory lock: ${e.message}`)
    }
  }
}

async function unapplied(pg, pending) {
  const migrations = new Map(pending)
  // get applied migrations if they exist
  const [{ exists }] = await pg`SELECT EXISTS (
        SELECT 1
        FROM   pg_catalog.pg_class c
        WHERE  c.relname = 'migrations'
        AND    c.relkind = 'r'
      )`
  const applied = exists
    ? await pg`SELECT name, hash FROM migrations ORDER BY id ASC`
    : []

  // any applied must exist in migrations, match hash and name, and be in order
  // remove the applied migrations and apply the rest
  const iter = migrations.entries()
  for (const { name, hash } of applied) {
    const { value: [mName, { hash: mHash }] } = iter.next()
    if (mName !== name) {
      if (migrations.has(name)) {
        throw new Error(
          'migrate: applied migrations are missing from the migrations' +
            ' passed in or are out of order',
        )
      } else {
        throw new Error(
          `migrate: ${name} is applied but was not found in migrations passed in`,
        )
      }
    }

    if (hash !== mHash) {
      throw new Error(
        `migrate: migration ${name} is applied but hash has changed`,
      )
    }
    migrations.delete(name)
  }

  return migrations
}

async function fromDir(dir) {
  let migrations = new Map()

  for await (const entry of walk(dir, { exts: ['.sql'] })) {
    const name = basename(entry.path, '.sql')

    if (migrations.has(name)) {
      throw new Error(`migrate: migration name collision on ${name}`)
    }

    migrations.set(name, entry.path)
  }

  migrations = new Map(
    [...migrations].sort((a, b) => String(a[0]).localeCompare(b[0])),
  )

  for (const [name, path] of migrations) {
    migrations.set(name, Deno.readTextFileSync(path))
  }

  return migrations
}