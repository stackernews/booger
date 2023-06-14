// these are all per ip .. except duplicate content
export default {
  // max events per interval with option to prevent duplicates
  // in the same interval
  eventLimits: {
    interval: 60, // seconds
    count: 100, // max events per interval
    duplicateContentIgnoreLen: null, // null to disable
  },
  // max simultaneous subscriptions per ip
  maxSubscriptions: 100,
  // max simultaneous filters per ip
  maxFilters: 1000,
  // max simultaneous connections per ip
  maxConnections: 20,
}
