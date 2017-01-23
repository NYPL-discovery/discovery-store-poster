'use strict'

const SierraRecord = require('./sierra-record')

class BibSierraRecord extends SierraRecord {
  prefixedId () {
    var prefix = ''
    if (this.nyplSource && /recap-[PC]/.test(this.nyplSource)) {
      prefix = this.nyplSource.substring(6, 7).toLowerCase()
    }
    return `${prefix}b${this.id}`
  }
}

BibSierraRecord.from = (record) => {
  return new BibSierraRecord(record)
}

module.exports = BibSierraRecord
