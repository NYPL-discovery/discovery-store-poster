'use strict'

const readCsv = require('./utils').readCsv

class Lookup {

  constructor (data) {
    this.data = data
  }

  lookup (key) {
    var rows = this.data.filter((row) => row[0] === key)
    if (rows.length === 0) return null
    if (rows.length > 1) return null

    return rows[0][1]
  }
}

Lookup.initialize = (type) => {
  var path = './data/lookup-' + type + '.csv'
  return readCsv(path).then((rows) => new Lookup(rows))
}

module.exports = Lookup
