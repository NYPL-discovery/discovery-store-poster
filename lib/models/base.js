'use strict'

const db = require('../db')
const groupBy = require('../utils').groupBy

const DB_ENTITY_CACHE = process.env.DB_ENTITY_CACHE === 'true'

class Base {
  constructor (stmts) {
    // Assume first statement has primary record as subject:
    if (stmts && stmts.length > 0) this.id = stmts[0].subject_id

    this._statements = stmts
      .filter((s) => s.subject_id === this.id)

    // Group blank node statements:
    const blankNodeStatementsGrouped = stmts
      // Filter out anything referring to primary subject:
      .filter((s) => s.subject_id !== this.id)
      // Group blank node statements by subject_id:
      .reduce((blankNodeStatementsById, statement) => {
        if (!blankNodeStatementsById[statement.subject_id]) blankNodeStatementsById[statement.subject_id] = []

        blankNodeStatementsById[statement.subject_id].push(statement)
        return blankNodeStatementsById
      }, {})

    // Build internal hash of blank nodes (as instances of `Base`)
    this._blankNodes = Object.keys(blankNodeStatementsGrouped).reduce((h, blankNodeId) => {
      h[blankNodeId] = new Base(blankNodeStatementsGrouped[blankNodeId])
      return h
    }, {})

    if (this._statements && this._statements.length > 0) this.id = this._statements[0].subject_id
  }

  statements (pred) {
    if (!pred) return this._statements
    return this._statements.filter((s) => s.predicate === pred)
  }

  statement (pred) {
    return this.statements(pred)[0]
  }

  literals (pred) {
    return this.statements(pred).map((s) => s.object_literal)
  }

  literal (pred) {
    return this.literals(pred)[0]
  }

  objectIds (pred) {
    return this.statements(pred).map((s) => s.object_id)
  }

  objectId (pred) {
    return this.objectIds(pred)[0]
  }

  blankNodes (pred) {
    return this.statements(pred)
      // Ensure statement refers to a blank node in our hash:
      .filter((s) => this._blankNodes[s.object_id])
      .map((s) => this._blankNodes[s.object_id])
  }

  label () {
    return this.literal('skos:prefLabel')
  }
}

Base.byId = (Klass, id) => {
  var fetch = () => {
    var type = Klass.name.toLowerCase()
    return db.getStatements(type, id)
      .then((s) => s.length > 0 ? new Klass(s) : null)
  }

  if (DB_ENTITY_CACHE) {
    return Base.cached([ Klass.name, id ], fetch)
  } else return fetch()
}

Base.byWhere = (Klass, match) => {
  var fetch = () => {
    var type = Klass.name.toLowerCase()
    return db.getStatementsWhere(type, match)
      .then((s) => groupBy(s, 'subject_id').map((s) => new Klass(s)))
  }

  if (DB_ENTITY_CACHE) {
    // return Base.cached([ Klass.name, match ], fetch)
    return Base.cached(this.arguments, fetch)
  } else return fetch()
}

Base.byStatement = (Klass, predicate, object, opts) => {
  opts = opts || {}
  opts = Object.assign({
    returnFirst: false  // If true, return first result rather than array of results
  }, opts)

  var fetch = () => {
    var type = Klass.name.toLowerCase()
    return db.getStatementsFor(type, predicate, object)
      .then((s) => groupBy(s, 'subject_id').map((s) => new Klass(s)))
      .then((results) => opts.returnFirst ? results[0] : results)
  }

  if (DB_ENTITY_CACHE) {
    // return Base.cached([ Klass.name, predicate, object ], fetch)
    return Base.cached([ Klass.name, predicate, object ], fetch)
  } else return fetch()
}

var __entity_cache = {}
Base.cached = (params, fetch) => {
  var cacheKey = JSON.stringify(params)
  if (__entity_cache[cacheKey]) return Promise.resolve(__entity_cache[cacheKey])
  else {
    return fetch().then((res) => {
      __entity_cache[cacheKey] = res
      return Promise.resolve(res)
    })
  }
}

module.exports = Base
