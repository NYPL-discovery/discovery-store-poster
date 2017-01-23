'use strict'

class Statement {
  constructor (props) {
    for (var k in props) {
      this[k] = props[k]
    }
    if (!this.subject_id) throw new Error('subject_id missing')
    if (!this.predicate) throw new Error('pred missing')
    if (!this.object_id && this.object_literal === null) throw new Error(this.predicate + ': no object given')
  }
}

Statement.builder = (subject_id, creator_id, base_source_hash) => {
  if (!base_source_hash.id) throw new Error(subject_id + ': no source_id given')
  if (!creator_id) throw new Error(subject_id + ': no creatord_id given')

  return new function () {
    this.statements = []

    this.add = (predicate, object, index, source_hash) => {
      source_hash = Object.assign({}, base_source_hash, source_hash)

      if (index === null || (typeof index) !== 'number') {
        var matching = (this.getAll(predicate) || []).filter((s) => {
          if (object.literal) return object.literal === s.object_literal
          else return object.id === s.object_id
        })[0]
        if (matching) index = matching.index
        else index = (this.getAll(predicate) || []).length
      }

      if ((typeof index) !== 'number') throw new Error(predicate + ': no index given')
      if (!object || (!object.id && !object.literal && object.type !== 'xsd:boolean')) throw new Error(subject_id + ' > ' + predicate + ': invalid object: ' + JSON.stringify(object, null, 2))
      if (!source_hash || !source_hash.record_id) throw new Error(predicate + ': no record_id given')

      var props = {
        subject_id,
        predicate,
        source_id: source_hash.id,
        source_record_id: source_hash.record_id,
        creator_id,
        index
      }
      if (object.id) props.object_id = object.id
      if (object.label) props.object_label = object.label
      if (object.literal || object.type === 'xsd:boolean') props.object_literal = object.literal
      if (object.type) props.object_type = object.type
      if (source_hash.path) props.source_record_path = source_hash.path

      var statement = new Statement(props)
      this.statements.push(statement)
    }

    this.getAll = (pred) => this.statements.filter((s) => s.predicate === pred)
    this.get = (pred) => this.getAll(pred)[0]
  }
}

module.exports = Statement
