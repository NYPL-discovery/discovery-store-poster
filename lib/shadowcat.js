var config = require('config')
var MongoClient = require('mongodb').MongoClient

var __connection = null
function connect () {
  // returns a promise:
  if (__connection) {
    return Promise.resolve(__connection)
  } else {
    return MongoClient.connect(config.get('shadowcat.url')).then((connection) => {
      __connection = connection
      return __connection
    })
  }
}

// Return a [Promise that resolves a] bib by id
function bib (id) {
  return connect().then((connection) => {
    return connection.collection('bib').findOne({ _id: parseInt(id) })
  })
}

// Return a [Promise that resolves a] item by id
function item (id) {
  return connect().then((connection) => {
    return connection.collection('item').findOne({ _id: parseInt(id) })
  })
}

module.exports = { bib, item }
