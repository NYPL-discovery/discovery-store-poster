'use strict'

class SierraRecord {
  constructor (h) {
    for (var k in h) {
      this[k] = h[k]
    }
    // Build a lookup hash of fixed fields:
    this._fixedMap = {}
    if (this.fixedFields) {
      this._fixedMap = Object.keys(this.fixedFields).reduce((map, k) => {
        var value = this.fixedFields[k].value
        var label = this.fixedFields[k].label
        map[label] = value
        return map
      }, {})
    }
  }

  vars () {
    return this.varFields ? Array.prototype.slice.call(this.varFields) : []
  }

  ldr () {
    var val = this.vars().filter((v) => v['fieldTag'] === '_')[0]
    if (!val || !val['content']) return null

    val = val['content']
    return {
      recStat: val[5],
      recType: val[6],
      bibLevel: val[7]
    }
  }

  fixed (label) {
    /*
    if (!this.fixedFields || this.fixedFields.length === 0) return null
    console.log('get fixed: ', label, this.fixedFields)
    var match = this.fixedFields.filter((f) => f['label'] === label)
    console.log('get fixed: ', label, match)
    return match.length >= 1 ? match[0].value : null
    */
    return this._fixedMap[label]
  }

  // Get marc field segment (e.g. 008 35-37 => 'eng')
  varFieldSegment (marc, range) {
    var values = this.varField(marc)
    if (values && values.length > 0) {
      if (values[0].length >= range[1]) {
        // Note: ranges are generally specified inclusive, so ending index should add 1
        return values[0].substring(range[0], range[1] + 1)
      }
    }
  }

  // Return content for given marc tag
  // if subfields given, returns content of those fields joined (or as a hash if opts.tagSubfields is truthy)
  varField (marc, subfields, opts) {
    opts = opts || {}
    opts = Object.assign({
      tagSubfields: false,
      subfieldJoiner: ' '
    }, opts)

    if (this.vars().length) {
      var vals = this.vars().filter((f) => f['marcTag'] === `${marc}`).map((f) => {
        // sometimes there's a case error...
        var _subFields = f['subFields'] || f['subfields']

        // return subfields based on options
        var subfieldParse = (subs) => {
          if (opts.tagSubfields) {
            return subs.reduce((hash, sub) => {
              hash[sub['tag']] = sub['content']
              return hash
            }, {})
          } else {
            return subs.map((sub) => sub['content']).join(opts.subfieldJoiner)
          }
        }

        // If asked to match certain subfields, return only those:
        if (subfields) {
          var subs = (_subFields || []).filter((sub) => subfields.indexOf(sub['tag']) >= 0)
          return subfieldParse(subs)
        // Otherwise, attempt to return 'content', falling back on subfields' content:
        } else {
          return f['content'] || (_subFields ? subfieldParse(_subFields) : null)
        }
      })
      return [].concat.apply([], vals).filter((v) => v)
    }
  }
}

SierraRecord.from = (record) => {
  return new SierraRecord(record)
}

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
      index = index === null || (typeof index) !== 'number' ? 0 : index

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
      if (object.literal) props.object_literal = object.literal
      if (object.type) props.object_type = object.type
      if (source_hash.path) props.source_record_path = source_hash.path

      var statement = new Statement(props)
      this.statements.push(statement)
    }

    this.get = (pred) => this.statements.filter((s) => s.predicate === pred)[0]
  }
}

class Datasource {}
Datasource.ORIGINAL_RESEARCH = { id: 10020 }
Datasource.SIERRA_NYPL = { id: 10004 }
Datasource.RECAP_NYPL = { id: 10010 }
Datasource.RECAP_PUL = { id: 10011 }
Datasource.RECAP_CUL = { id: 10012 }
Datasource.byMarcJsonNyplSource = (source) => {
  switch (source) {
    case 'recap-NYPL':
      return Datasource.RECAP_NYPL
    case 'recap-PUL':
      return Datasource.RECAP_PUL
    case 'recap-CUL':
      return Datasource.RECAP_CUL
    case 'sierra-nypl':
      return Datasource.SIERRA_NYPL
  }
}

class Creator {}
Creator.CORE_SERIALIZER = { id: 1, name: 'Core serializer' }

module.exports = { SierraRecord, Statement, Datasource, Creator }
