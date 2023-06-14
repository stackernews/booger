import { walk } from 'std/fs/walk.ts'
import { globToRegExp } from 'std/path/glob.ts'
import { readLines } from 'std/io/read_lines.ts'
import { basename, dirname } from 'std/path/mod.ts'

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

export async function plugsInit() {
  try {
    const ignorePatterns = await getIgnorePatterns()

    for await (
      const p of walk('./plugs/', {
        exts: ['.js', '.ts'],
        skip: ignorePatterns,
      })
    ) {
      console.log(`plug ${p.path} found, registering...`)
      // start the worker and ask it which events it wants to listen to
      try {
        const worker = new Worker(new URL(p.path, import.meta.url).href, {
          type: 'module',
          name: basename(p.path, '.js') || basename(p.path, '.ts'),
        })
        await new Promise((resolve, reject) => {
          setTimeout(() =>
            reject(
              new Error(
                `${p.path} did not respond to 'getactions' within 5s. Is it a web worker?`,
              ),
            ), 5000)

          worker.onmessage = ({ data }) => {
            console.log(
              `plug ${p.path} registered for actions: ${data.join(', ')}`,
            )
            for (const action of data) {
              if (!Object.keys(plugs).includes(action.toLowerCase())) {
                console.error(
                  `plug ${p.path} tried to register for unknown action ${action}`,
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
      } catch (e) {
        console.error(e)
        Deno.exit(1)
      }
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) {
      throw error
    }
  }
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
