'use strict'

class Base {
  constructor (stmts) {
    this._statements = stmts
    if (this._statements && this._statements.length > 0) this.id = this._statements[0].subject_id
  }

  statements (pred) {
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

  label () {
    return this.literal('skos:prefLabel')
  }
}

module.exports = Base
