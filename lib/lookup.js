'use strict'

const readCsv = require('./utils').readCsv

var _cache = {}

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
  if (_cache[type]) return Promise.resolve(_cache[type])

  var path = './data/lookup-' + type + '.csv'
  return readCsv(path).then((rows) => {
    var lookup = new Lookup(rows)
    _cache[type] = lookup
    return lookup
  })
}

module.exports = Lookup
