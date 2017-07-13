'use strict'

const SierraRecord = require('./sierra-record')

// console.log('sierra record class: ', SierraRecord)

class ItemSierraRecord extends SierraRecord {
  prefixedId () {
    var prefix = ''
    if (this.isPartnerRecord()) {
      prefix = this.nyplSource.substring(6, 7).toLowerCase()
    }
    return `${prefix}i${this.id}`
  }
}

ItemSierraRecord.from = (record) => {
  return new ItemSierraRecord(record)
}

module.exports = ItemSierraRecord
