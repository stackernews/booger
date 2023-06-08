export default {
  // min prefix length for ids and authors
  minPrefixLength: 4,
  // min subscription id length
  minSubscriptionIdLength: 1,
  // max subscription id length
  maxSubscriptionIdLength: 255,
  // min createdAt allowed
  minCreatedAt: 0,
  // max createdAt allowed
  maxCreatedAt: 2147483647,
  // max tag id length, i.e. [LEN(tagId), tadData, ...]
  maxTagIdLength: 255,
  // max tag data length, i.e. [tagId, LEN(tadData), ...]
  maxTagDataLength: 1024,
  // max number of tags allowed, i.e. LEN([[tagId, tadData, ...], ...])
  maxTagCount: 2500,
  // max content field size
  maxContentSize: 10 * 1024,
  // max ids in filter
  maxIds: 1000,
  // max authors in filter
  maxAuthors: 1000,
  // max kinds in filter
  maxKinds: 100,
  // min limit in filter
  minLimit: 0,
  // max limit in filter
  maxLimit: 5000,
}
