'use strict'

// const orm = require('orm')
// const qOrm = require('q-orm')

var config = require('config')

var pgp = require('pg-promise')()
var db = pgp(config.get('pg.url'))

const tripleSchema = {
  subject_id: { type: 'text', size: 100, key: true },
  predicate: { type: 'text', size: 50, key: true },
  object_id: { type: 'text', size: 512 },
  object_literal: { type: 'text' },
  object_type: { type: 'text', size: 50 },
  object_label: { type: 'text' },
  source: { type: 'text', size: 20, key: true },
  source_record_id: { type: 'text', size: 50, key: true },
  source_record_path: { type: 'text', size: 50 },
  creator: { type: 'text', size: 20 },
  created: { type: 'date', time: true }
}

var upsertStatement = (tableName, record) => {
  record = Object.assign({
    object_id: null,
    object_literal: null,
    object_type: null,
    object_label: null,
    source_record_path: null
  }, record)

  var primaryKeyClause = 'subject_id=${subject_id} AND predicate=${predicate} AND source=${source} AND source_record_id=${source_record_id}'

  // Fake an upsert
  var update = [
    `UPDATE ${tableName}`,
    'SET object_id=${object_id}, object_literal=${object_literal}, object_label=${object_label}, created=NOW()',
    `WHERE ${primaryKeyClause}`
  ].join(' ')

  var insert = [
    `INSERT INTO ${tableName}`,
    `(${Object.keys(tripleSchema).join(', ')})`,
    `SELECT ${Object.keys(tripleSchema).map((k) => k === 'created' ? 'NOW()' : `\${${k}}`).join(', ')}`,
    `WHERE NOT EXISTS (SELECT 1 FROM ${tableName} WHERE ${primaryKeyClause})`
  ].join(' ')

  return db.none([update, insert].join('; '), record).catch((e) => console.error('DB error: ', e))
}

var createDb = () => {
  createTable('resource_statement', tripleSchema)
}

var createTable = (name, schema) => {
  var pk = []
  var colDeclarations = Object.keys(schema).map((prop) => {
    var type = null
    var spec = schema[prop]
    if (spec.key) pk.push(prop)
    switch (spec.type) {
      case 'text':
        type = 'TEXT'
        if (spec.size) type = `VARCHAR(${spec.size})`
        break
      case 'date':
        type = 'DATE'
        if (spec.time) type = 'TIMESTAMP'
        break
    }
    if (spec.key) type += ' NOT NULL'
    return `${prop} ${type}`
  })
  if (pk.length > 0) {
    colDeclarations.push(`PRIMARY KEY (${pk.join(', ')})`)
  }
  var sql = `CREATE TABLE ${name} ${colDeclarations.join(', ')}`
  console.log('sql: ', sql)
}

module.exports = { upsertStatement, createDb }

// var pg = require('pg')
// var pool = new pg.Pool(config.get('pg'))

/*
var __connection = null
function connect () {
  // returns a promise:
  if (__connection) {
    return Promise.resolve(__connection)
  } else {
    return MongoClient.connect(config.get('mongo.url')).then((connection) => {
      __connection = connection
      return __connection
    }).catch((e) => console.error('mongo error: ', e))
  }
}

var connect = () => {
  return new Promise((resolve, reject) => {
    pool.connect(function (err, client, done) {
      if (err) {
        console.error('connexion error', err)
        return reject()
      }
      return resolve({ client, done })
    })
  })
}
*/

/*
const connect = () => {
  console.log('connecting', config.get('pg').url)
  // return qOrm.qConnect(config.git('pg').url).catch((err) => console.error('error connecting to db: ', err))
  return qOrm.qConnect(config.get('pg').url).then((cn) => {
    return cn
  }).catch((err) => console.error('error connecting to db: ', err))
}

var models = {}

const initialize = () => {
  const tripleSchema = {
    subject_id: { type: 'text', size: 100, key: true },
    predicate: { type: 'text', size: 50, key: true },
    object_id: { type: 'text', size: 512 },
    object_literal: String,
    object_label: String,
    source: { type: 'text', size: 20, key: true },
    source_record_id: { type: 'text', size: 50, key: true },
    source_record_path: { type: 'text', size: 50 },
    creator: { type: 'text', size: 20 },
    created: { type: 'date', time: true }
  }

  console.log('connect')
  return connect().then((db) => {
    console.log('create')
    models.ResourceStatement = db.qDefine('resource_statement', tripleSchema)

    return db.qSync()
  }).catch((e) => console.error('error! ', e))
}

module.exports = {
  connect,
  initialize,
  models
}

// pool.connect

function insert (collection, records, options) {
  return connect().then((connection) => {
    return connection.collection(collection).insertMany(records)
  })
}

function upsertOne (collection, record) {
  return connect().then((connection) => {
    connection.client.query('SELECT $1::int AS number', ['1'], function (err, result) {
      connection.done()

      if (err) {
        return console.error('error running query', err)
      }
      console.log('got: ', result.rows[0].number)
    })
  })
  console.log('upsert: ', collection, record)
  return connect().then((connection) => {
    console.log('connection: ', connection)

    // return connection.collection(collection).findOneAndReplace({ uri: record.uri }, record, { upsert: true })
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
; ['locations', 'resources', 'organizations', 'statuses', 'images'].forEach((coll) => {
  db[coll] = {
    insert: (records, options) => insert(coll, records, options),
    upsertOne: (record, options) => upsertOne(coll, record, options),
    upsertMany: (records, options) => upsertMany(coll, records, options),
    updateMany: (filter, updates, options) => updateMany(coll, filter, updates),
    find: (query) => find(coll, query),
    findOne: (query) => findOne(coll, query)
  }
  db.upsertMany = upsertMany
  db.connect = connect
})

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
module.exports = db
*/
