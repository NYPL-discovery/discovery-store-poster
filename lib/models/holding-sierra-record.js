'use strict'

const SierraRecord = require('./sierra-record')

class HoldingSierraRecord extends SierraRecord {
  // Add a conditional that flips suppressed = true if this.deleted or this.suppressed
  getSuppressedWithRationale () {
    let suppressed = false
    const rationale = []

    if (this.deleted || this.suppressed) {
      suppressed = true
      if (this.deleted) rationale.push('deleted')
      if (this.suppressed) rationale.push('suppressed')
    }

    return { suppressed, rationale }
  }

  getHoldingStrings () {
    return this.holdings.map((holding) => holding.holding_string).filter((h) => h)
  }
}

HoldingSierraRecord.from = (record) => {
  return new HoldingSierraRecord(record)
}

module.exports = HoldingSierraRecord
