import { walk } from 'std/fs/walk.ts'

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

export async function plugsInit() {
  for await (const p of walk('./plugs/', { exts: ['.js', '.ts'] })) {
    // start the worker and ask it which events it wants to listen to
    const worker = new Worker(new URL(p.path, import.meta.url).href, {
      type: 'module',
    })
    await new Promise((resolve) => {
      worker.onmessage = ({ data }) => {
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
      worker.onerror = (e) => {
        console.error(e)
        Deno.exit(1)
      }
      worker.postMessage('getactions')
    })
  }
}

export async function plugsAction(action, meta, data) {
  return await Promise.all(plugs[action].map((worker) => {
    return new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => {
        if (!data.accept) {
          reject(new Error(data.reason))
        }
        resolve()
      }
      worker.onerror = reject
      worker.postMessage({ action, meta, data })
      // if the action isn't something that can be rejected, resolve immediately
      if (['eose', 'disconnect', 'error', 'notice', 'unsub'].includes(action)) {
        resolve()
      }
    })
  }))
}
