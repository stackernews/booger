import { walk } from 'std/fs/walk.ts'
import { globToRegExp } from 'std/path/glob.ts'
import { readLines } from 'std/io/read_lines.ts'
import { basename, dirname } from 'std/path/mod.ts'
import './plugs/builtin/validate/sub.js'
import './plugs/builtin/validate/event.js'
import './plugs/builtin/limits/limits.js'
import './plugs/builtin/stats/stats.js'

const plugs = {
  connect: [],
  disconnect: [],
  sub: [],
  unsub: [],
  eose: [],
  event: [],
  notice: [],
  error: [],
}

async function getIgnorePatterns() {
  const patterns = []
  for await (const p of walk('./plugs/', { match: ['\.plugsignore'] })) {
    const fileReader = await Deno.open(p.path)
    for await (const line of readLines(fileReader)) {
      if (line.startsWith('#')) continue
      let dir = dirname(p.path)
      if (!line.startsWith('/')) {
        dir += '/**/'
      }
      patterns.push(globToRegExp(dir + line))
    }
  }
  return patterns
}

// when we compile, the builtin plugs won't be present
const BUILTIN = [
  './plugs/builtin/validate/sub.js',
  './plugs/builtin/validate/event.js',
  './plugs/builtin/limits/limits.js',
  './plugs/builtin/stats/stats.js',
]

export async function plugsInit() {
  const builtins = new Set(BUILTIN.map((p) => new URL(p, import.meta.url).href))

  try {
    const ignorePatterns = await getIgnorePatterns()

    for await (
      const p of walk('./plugs/', {
        exts: ['.js', '.ts'],
        skip: ignorePatterns,
      })
    ) {
      const href = new URL(p.path, import.meta.url).href
      // start the worker and ask it which events it wants to listen to
      const worker = new Worker(href, {
        type: 'module',
        name: basename(p.path, '.js') || basename(p.path, '.ts'),
      })
      await plugIn(worker, p.path)
      builtins.delete(href)
    }
  } catch (e) {
    if (
      !(e instanceof Deno.errors.NotFound ||
        e.cause instanceof Deno.errors.NotFound)
    ) {
      throw e
    }
  }

  for (const builtin of builtins) {
    const worker = new Worker(builtin, {
      type: 'module',
      name: basename(builtin, '.js') ||
        basename(builtin, '.ts'),
    })
    await plugIn(worker, builtin)
  }
}

async function plugIn(worker, name) {
  return await new Promise((resolve, reject) => {
    console.log(`plug registering ${name}`)

    setTimeout(() =>
      reject(
        new Error(
          `${name} did not respond to 'getactions' within 5s. Is it a web worker?`,
        ),
      ), 5000)

    worker.onmessage = ({ data }) => {
      console.log(
        `plug registered ${name} for actions: ${data.join(', ')}`,
      )
      for (const action of data) {
        if (!Object.keys(plugs).includes(action.toLowerCase())) {
          console.error(
            `plug ${name} registered for unknown action ${action}`,
          )
          Deno.exit(1)
        }
        plugs[action.toLowerCase()].push(worker)
      }
      resolve()
    }
    worker.onerror = reject
    worker.postMessage('getactions')
  })
}

export async function plugsAction(action, conn, data) {
  const result = await Promise.allSettled(plugs[action].map((worker) => {
    return new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => {
        if (!data.accept) {
          reject(new Error(data.reason))
        }
        resolve()
      }
      worker.onerror = reject
      worker.postMessage({ action, conn, data })
      // if the action isn't something that can be rejected, resolve immediately
      if (['eose', 'disconnect', 'error', 'notice', 'unsub'].includes(action)) {
        resolve()
      }
    })
  }))

  result.forEach((r) => {
    if (r.status === 'rejected') throw r.reason
  })
}
