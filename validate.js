import Joi from 'joi'
import * as secp256k1 from '@noble/secp256k1'

export const prefixSchema = Joi.string().case('lower').hex().min(4).max(64)
  .label('prefix')

export const idSchema = Joi.string().case('lower').hex().length(64).label('id')

export const pubkeySchema = Joi.string().case('lower').hex().length(64)
  .label('pubkey')

export const kindSchema = Joi.number().min(0).multiple(1).label('kind')

export const signatureSchema = Joi.string().case('lower').hex().length(128)
  .label('sig')

export const subscriptionSchema = Joi.string().min(1).max(255)
  .label('subscriptionId')

const seconds = (value, helpers) =>
  (Number.isSafeInteger(value) && Math.log10(value) < 10)
    ? value
    : helpers.error('invalid')

export const createdAtSchema = Joi.number().min(0).multiple(1).custom(seconds)

export const tagSchema = Joi.array()
  .ordered(Joi.string().max(255).required().label('identifier'))
  .items(Joi.string().allow('').max(1024).label('value'))
  .max(10)
  .label('tag')

export const eventSchema = Joi.object({
  id: idSchema.required(),
  pubkey: pubkeySchema.required(),
  created_at: createdAtSchema.required(),
  kind: kindSchema.required(),
  tags: Joi.array().items(tagSchema).max(2500).required(),
  content: Joi.string()
    .allow('')
    .max(100 * 1024) // 100 kB
    .required(),
  sig: signatureSchema.required()
}).unknown(false)

export const filterSchema = Joi.object({
  ids: Joi.array().items(prefixSchema.label('prefixOrId')).max(1000),
  authors: Joi.array().items(prefixSchema.label('prefixOrAuthor')).max(1000),
  kinds: Joi.array().items(kindSchema).max(20),
  since: createdAtSchema,
  until: createdAtSchema,
  limit: Joi.number().min(0).multiple(1).max(5000)
}).pattern(/^#[a-z]$/, Joi.array().items(Joi.string().max(1024)).max(256))

export const delegateSchema = Joi.array().ordered(
  pubkeySchema.required(),
  Joi.string()
    .pattern(/^((^(?!&)|(?!^)&)(kind=[0-9]+|created_at[<>][0-9]+))+$/i)
    .required(),
  signatureSchema.required())

export async function computeId ({
  pubkey, created_at: createdAt, kind, tags, content
}) {
  const canon = [0, pubkey, createdAt, kind, tags, content]
  const id = await secp256k1.utils
    .sha256(Buffer.from(JSON.stringify(canon)))
  return Buffer.from(id).toString('hex')
}

export async function validateId (event) {
  if (event.id !== await computeId(event)) {
    throw new Error('invalid: id is not the sha256 hash of note')
  }
}

export async function validateSig ({ sig, id, pubkey }) {
  if (!await secp256k1.schnorr.verify(sig, id, pubkey)) {
    throw new Error('invalid: signature does not match pubkey')
  }
}

export function validateDelegation (kind, createdAt, conds) {
  const { kinds, to, from } =
    conds.split('&').reduce((a, c) => {
      if (c.startsWith('kind=')) {
        a.kinds.push(parseInt(c.slice(5)))
      } else if (c.startsWith('created_at>')) {
        a.from = parseInt(c.slice(11))
      } else if (c.startsWith('created_at<')) {
        a.to = parseInt(c.slice(11))
      }
      return a
    }, { kinds: [] })

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
