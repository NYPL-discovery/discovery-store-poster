'use strict'

var config = require('config')
var MongoClient = require('mongodb').MongoClient

var __connection = null
function connect () {
  // returns a promise:
  if (__connection) {
    return Promise.resolve(__connection)
  } else {
    return MongoClient.connect(config.get('mongo.url')).then((connection) => {
      __connection = connection
      return __connection
    })
  }
}

function insert (collection, records, options) {
  return connect().then((connection) => {
    return connection.collection(collection).insertMany(records)
  })
}

function upsertOne (collection, record) {
  return connect().then((connection) => {
    // console.log('find and replace one', record)
    return connection.collection(collection).findOneAndReplace({ uri: record.uri }, record, { upsert: true })
  })
}

function upsertMany (collection, records, options) {
  options = options || {}
  options = Object.assign({
  }, options)

  return Promise.all(records.map((record) => upsertOne(collection, record)))
}

function updateMany (collection, filter, updates) {
  return connect().then((connection) => {
    return connection.collection(collection).updateMany(filter, updates)
  })
}

function find (collection, query) {
  return connect().then((connection) => {
    connection.collection(collection).find(query)
  })
}

function findOne (collection, query) {
  return connect().then((connection) => {
    return connection.collection(collection).findOne(query)
  })
}

var db = {}

// Map collection-generic functions above to a hash of collection-specific functions:
; ['locations', 'resources'].forEach((coll) => {
  db[coll] = {
    insert: (records, options) => insert(coll, records, options),
    upsertMany: (records, options) => upsertMany(coll, records, options),
    updateMany: (filter, updates, options) => updateMany(coll, filter, updates),
    find: (query) => find(coll, query),
    findOne: (query) => findOne(coll, query)
  }
  db.connect = connect
})

/*
db.resources.updateBibData = (record) => {
  // TODO fix this:
  var bnumberIdentifier = record['dcterms:identifier'][0].objectUri
  console.log('update bib data: ', bnumberIdentifier, record)
  var updates = { '$set': record }
  return db.resources.updateMany({ 'dcterms:identifier.objectUri': bnumberIdentifier }, updates).then((resp) => {
    console.log('update.d:', resp)
    if (resp.result.nModified === 0) {
      console.log('Bib update matched 0 docs')

      return db.resources.insert([record])
    }
  })
}

db.resources.updateItemData = (record) => {
  // TODO fix this:
  var bnumberIdentifier = record.bibIds[0]
  var updates = { '$set': record }
  return db.resources.updateOne({ uri: `${bnumberIdentifier}-${record.id}` }, updates).then((resp) => {
    if (resp.result.nModified === 0) {
      console.log('Item update matched 0 docs')

      return db.resources.insert([record])
    }
  })
}
*/
module.exports = db
