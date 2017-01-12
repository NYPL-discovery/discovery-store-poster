'use strict'

const log = require('loglevel')
const url = require('url')
const Pool = require('pg-pool')

const config = require('config')

const params = url.parse(config.get('pg.url'))
const auth = params.auth.split(':')

var PgNativeClient = require('pg-native')
const connectionConfig = {
  user: auth[0],
  password: auth[1],
  host: params.hostname,
  port: params.port,
  database: params.pathname.split('/')[1]
}
// FIXME pg-pool doesn't play nicely with pg-native connection convention
// https://github.com/brianc/node-pg-pool/issues/41
process.env.PGHOST = connectionConfig.host
process.env.PGDATABASE = connectionConfig.database
process.env.PGUSER = connectionConfig.user
process.env.PGPASSWORD = connectionConfig.password
process.env.PGPORT = connectionConfig.port

const poolConfig = {
  Client: PgNativeClient,
  min: 4,
  max: 50,
  idleTimeoutMillis: 1000
}
const pool = new Pool(poolConfig)

pool.on('error', function (error, client) {
  console.error('pool error: ', error)
})

var connectCount = 0
pool.on('connect', function () {
  connectCount++
  // console.log('pool:: connect', connectCount)
})

var upsertStatements = (type, records) => {
  return Promise.all(records.map((record) => upsertStatement(type, record)))
}

// Given a sql string with named columns , returns a hash with:
//  - query: new sql string with numbered cols
//  - values: a flat, uniqued array suitable for passing to db with new sql string
var namedQueryToNumbered = (sql, hash) => {
  var values = []
  var propIndex = []

  var query = '' + sql
  sql.match(/\$\{[a-z_]+\}/g).forEach((m) => {
    var prop = m.substring(2, m.length - 1)
    var val = hash[prop]
    if ((typeof val) === 'undefined') val = null

    if (propIndex.indexOf(prop) < 0) {
      values[propIndex.length] = val
      propIndex.push(prop)
    }
    var ind = propIndex.indexOf(prop) + 1

    query = query.replace(m, `\$${ind}`)
  })

  return { query, values }
}

var upsertStatement = (type, record) => {
  return pool.connect().catch((e) => console.error(e)).then((client) => {
    if (!client) console.error('client null: ', client)
    return new Promise((resolve, reject) => {
      var sql = upsertStatementSql(type)
      var parameterized = namedQueryToNumbered(sql, record)

      return queryPrepared(client, `upsert_${type}`, parameterized.query, parameterized.values, function (err, rows) {
      // return client.query(parameterized.query, parameterized.values, function (err, rows) {
        // console.log('inserted? ', sqlNumbered, values, rows)
        client.release()
        if (err) console.log('err: ', err)
        if (err) reject(err)
        else resolve()
      })
    })
  })
}

// Given a connected client, runs named prepared statement, creating it if needed:
var queryPrepared = (client, name, sql, values, cb) => {
  // Attach hash to client indicating what prepared statements it knows about:
  if (!client.__preparedStatements) client.__preparedStatements = {}
  // Throw big error if attempting to run same prepared statement name with different sql
  if (client.__preparedStatements[name] && client.__preparedStatements[name] !== sql) throw new Error('Attempt to modify an existing prepared statement: ' + name)

  // This runs the query once it has been prepared:
  var _execPrepared = () => client.execute(name, values, cb)

  // If already prepared for this client, run it:
  if (client.__preparedStatements[name]) _execPrepared()
  else {
    // ..Otherwise, prepare it and then run it:
    client.prepare(name, sql, values.length, function (err) {
      if (err) console.log('err: ', err)

      client.__preparedStatements[name] = sql
      _execPrepared()
    })
  }
}
queryPrepared

// (subject_id, predicate, source, source_record_id)
const tripleSchema = {
  subject_id: { type: 'text', size: 100, key: true },
  predicate: { type: 'text', size: 50, key: true },
  // rule_uri: { type: 'text', size: 100, key: true },
  object_id: { type: 'text', size: 512 },
  object_literal: { type: 'text' },
  object_type: { type: 'text', size: 50 },
  object_label: { type: 'text' },
  source_id: { type: 'int', size: 20 },
  source_record_id: { type: 'text', size: 50 },
  source_record_path: { type: 'text', size: 50 },
  creator_id: { type: 'int', key: true },
  index: { type: 'int', key: true },
  created: { type: 'date', time: true }
}

const creatorSchema = {
  id: { type: 'int', key: true, serial: true },
  name: { type: 'text', size: 100 }
}

/*
var addMissingStatementFields = (record) => {
  return Object.assign({
    object_id: null,
    object_literal: null,
    object_type: null,
    object_label: null,
    source_record_path: null
  }, record)
}
*/

var upsertStatementSql = (type) => { // , record) => {
  var pkColumns = Object.keys(tripleSchema).filter((prop) => tripleSchema[prop].key)

  var updateCols = Object.keys(tripleSchema).filter((prop) => !tripleSchema[prop].key && ['created'].indexOf(prop) < 0).map((prop) => `${prop}=\${${prop}}`).join(', ')
  var tableName = `${type}_statement`
  return [
    `INSERT INTO ${tableName}`,
    `(${Object.keys(tripleSchema).join(', ')})`,
    'VALUES',
    `(${Object.keys(tripleSchema).map((k) => k === 'created' ? 'NOW()' : `\${${k}}`).join(', ')})`,
    `ON CONFLICT(${pkColumns.join(', ')})`,
    'DO UPDATE SET',
    updateCols
  ].join(' ')
}

var getStatement = (type, subjectId, predicate) => {
  var tableName = `${type}_statement`
  return getOne(`SELECT * FROM ${tableName} WHERE subject_id = $1 AND predicate = $2 LIMIT 1`, [subjectId, predicate])
}

var getStatements = (type, subjectId) => {
  var tableName = `${type}_statement`
  return getMany(`SELECT * FROM ${tableName} WHERE subject_id = $1`, [subjectId])
}

var getStatementsWhere = (type, match) => {
  var tableName = `${type}_statement`
  var matchingClause = Object.keys(match).map((prop) => `${prop} = \${${prop}}`)
  var sql = `SELECT * FROM ${tableName} WHERE ${matchingClause}`
  var parameterized = namedQueryToNumbered(sql, match)
  return getMany(parameterized.query, parameterized.values)
}

var getStatementsFor = (type, predicate, match) => {
  var where = ['predicate = ${predicate}']
  if (match.id) where.push('object_id = ${object_id}')
  else where.push('object_literal = ${object_literal}')

  var values = { predicate, object_id: match.id, object_literal: match.literal }

  var sql = [
    'SELECT S.* FROM (',
    ` SELECT subject_id FROM ${type}_statement _S`,
    ` WHERE ${where.join(' AND ')}`,
    `) M INNER JOIN ${type}_statement S ON M.subject_id = S.subject_id`
  ].join('\n')
  var parameterized = namedQueryToNumbered(sql, values)
  return getMany(parameterized.query, parameterized.values)
}

var getMany = (sql, values) => getResults(sql, values, true)
var getOne = (sql, values) => getResults(sql, values, false)
var execute = (sql, values) => getResults(sql, values, true)

var getResults = (sql, values, many) => {
  return pool.connect().then((client) => {
    // console.log('then? ', client.query('select count(*) FROM resource_statement', []))
    return new Promise((resolve, reject) => {
      client.query(sql, values, (err, res) => {
        client.release()

        if (err) reject(err)
        else resolve(many ? res : res[0])
      })
    })
  })
}

var deleteStatements = (tableName, match) => {
  tableName = `${tableName}_statement`
  var matchingClause = Object.keys(match).map((prop) => `${prop} = \${${prop}}`)
  var sql = `DELETE FROM ${tableName} WHERE ${matchingClause}`
  var parameterized = namedQueryToNumbered(sql, match)
  return execute(parameterized.query, parameterized.values)
}

const ENTITY_TYPES = ['resource', 'organization', 'location', 'status', 'datasource', 'accessmessage', 'catalogitemtype']

var createDb = (recreate) => {
  var _create = () => {
    var creators = ENTITY_TYPES.map((type) => createTable(`${type}_statement`, tripleSchema))
    creators.push(createTable('creator', creatorSchema))

    return Promise.all(creators)
  }

  var _destroy = () => {
    console.log('Recreating db')
    return Promise.all(
      ENTITY_TYPES
        .map((name) => execute(`DROP TABLE IF EXISTS ${name}_statement`))
    )
  }

  if (recreate) {
    return _destroy().then(_create).catch((e) => log.error('DB create error: ', e))
  } else return _create().catch((e) => log.error('DB create error: ', e))
}

var getStats = () => {
  return Promise.all(
    ENTITY_TYPES.map((type) => {
      return getOne(`SELECT COUNT(*) FROM ${type}_statement WHERE predicate = 'rdf:type'`)
        .then((result) => ({ count: result.count, type }))
    })
  )
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
      case 'int':
        type = 'INT'
        break
    }
    if (spec.key) type += ' NOT NULL'
    return `${prop} ${type}`
  })
  if (pk.length > 0) {
    colDeclarations.push(`PRIMARY KEY (${pk.join(', ')})`)
  }
  var sql = `CREATE TABLE IF NOT EXISTS ${name} (${colDeclarations.join(', ')})`
  return execute(sql)
}

module.exports = { upsertStatement, upsertStatements, createDb, getStatements, getStatement, getStatementsFor, getStatementsWhere, deleteStatements, getStats }

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
