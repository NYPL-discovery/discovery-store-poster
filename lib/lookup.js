'use strict'

var _cache = {}

class Lookup {
  constructor (data) {
    this.data = data
  }

  lookup (key) {
    return this.data[key]
  }
}

Lookup.initialize = (type) => {
  if (_cache[type]) return Promise.resolve(_cache[type])

  var path = '../data/lookup-' + type + '.json'
  _cache[type] = new Lookup(require(path))

  return Promise.resolve(_cache[type])
}

Lookup.lookup = (type, key) => {
  return Lookup.initialize(type)
    .then((lookup) => lookup.lookup(key))
    .then((label) => {
      return label
    })
}

Lookup.lookup = (type, key) => {
  return Lookup.initialize(type)
    .then((lookup) => lookup.lookup(key))
    .then((label) => {
      return label
    })
}

module.exports = Lookup
