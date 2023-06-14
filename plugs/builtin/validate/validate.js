import { z } from 'zod'
import { schnorr } from 'secp'
import { crypto, toHashString } from 'std/crypto/mod.ts'
import CONFIG from './validate.config.js'

export const zPrefix = z.string().regex(
  new RegExp(`^[a-f0-9]{${CONFIG.minPrefixLength},64}$`),
)

export const zId = z.string().regex(/^[a-f0-9]{64}$/)

export const zPubkey = z.string().regex(/^[a-f0-9]{64}$/)

export const zKind = z.number().int().gte(0)

export const zSig = z.string().regex(/^[a-f0-9]{128}$/)

export const zSub = z.string().min(CONFIG.minSubscriptionIdLength)
  .max(CONFIG.maxSubscriptionIdLength)

export const zTime = z.number().int().min(CONFIG.minCreatedAt)
  .max(CONFIG.maxCreatedAt)

export const zTag = z.tuple([z.string().max(CONFIG.maxTagIdLength)])
  .rest(z.string().max(CONFIG.maxTagDataLength))

export const zEvent = z.object({
  id: zId,
  pubkey: zPubkey,
  created_at: zTime,
  kind: zKind,
  tags: z.array(zTag).max(CONFIG.maxTagCount),
  content: z.string().max(CONFIG.maxContentSize),
  sig: zSig,
}).refine(async (e) => {
  try {
    return e.id === await eventHash(e)
  } catch {
    return false
  }
}, { message: 'invalid: id not equal to sha256 of note' }).refine(
  (e) => schnorr.verify(e.sig, e.id, e.pubkey),
  { message: 'invalid: sig does not match pubkey' },
)

export const zFilter = z.object({
  ids: z.array(zPrefix).max(CONFIG.maxIds),
  authors: z.array(zPrefix).max(CONFIG.maxAuthors),
  kinds: z.array(zKind).max(CONFIG.maxKinds),
  since: zTime,
  until: zTime,
  limit: z.number().int().min(CONFIG.minLimit).max(CONFIG.maxLimit),
}).catchall(
  z.array(z.string().max(CONFIG.maxTagDataLength)).max(CONFIG.maxTagCount),
).partial()

export const zFilters = z.array(zFilter)

const zDelegateCond = z.array(
  z.union([
    z.string().regex(/^kind=[0-9]+$/),
    z.string().regex(/^created_at[<>][0-9]+$/),
  ]),
)
export const zDelegate = z.tuple([
  zPubkey,
  z.string().refine((c) => zDelegateCond.safeParse(c.split('&')).success),
  zSig,
]).transform((d) =>
  d[1].split('&').reduce((a, c) => {
    if (c.startsWith('kind=')) {
      a.kinds.push(parseInt(c.slice(5)))
    } else if (c.startsWith('created_at>')) {
      a.from = parseInt(c.slice(11))
    } else if (c.startsWith('created_at<')) {
      a.to = parseInt(c.slice(11))
    }
    return a
  }, { kinds: [] })
)

export async function eventHash({
  pubkey,
  created_at: createdAt,
  kind,
  tags,
  content,
}) {
  return await sha256HexStr(
    JSON.stringify([0, pubkey, createdAt, kind, tags, content]),
  )
}

export async function sha256HexStr(str) {
  return toHashString(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(str),
    ),
  )
}

export async function validateDelegation(kind, createdAt, pubkey, delegation) {
  const { kinds, to, from } = await zDelegate.parseAsync(delegation)

  try {
    schnorr.verify(
      delegation[2],
      await sha256HexStr(
        ['nostr', 'delegation', pubkey, delegation[1]].join(':'),
      ),
      delegation[0],
    )
  } catch {
    throw new Error('invalid: delegation token sig')
  }

  if (kinds && !kinds.includes(kind)) {
    throw new Error('invalid: not delegated for kind')
  }
  if (to && createdAt > to) {
    throw new Error('invalid: not delegated that far into future')
  }
  if (from && createdAt < from) {
    throw new Error('invalid: not delegated that far into past')
  }
}

// invalid: path.to.thing - message, path.to.other - message
export function zErrorToString(e) {
  let message = 'invalid: '
  for (const [i, issue] of e.issues.entries()) {
    for (const [i, path] of issue.path.entries()) {
      if (typeof path === 'number') {
        message += `[${path}]`
      } else {
        if (i !== 0) {
          message += '.'
        }
        message += `${path}`
      }
    }

    message += ` - ${issue.message}`

    if (i !== e.issues.length - 1) {
      message += ', '
    }
  }

  return message
}
