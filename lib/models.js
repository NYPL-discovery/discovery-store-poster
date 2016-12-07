'use strict'

class SierraRecord {
  constructor (h) {
    for (var k in h) {
      this[k] = h[k]
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
    if (!this.fixedFields || this.fixedFields.length === 0) return null
    var match = this.fixedFields.filter((f) => f['label'] === label)
    return match.length >= 1 ? match[0].value : null
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
  // if subfields given, returns content of those fields joined
  varField (marc, subfields, opts) {
    opts = opts || {}
    opts = Object.assign({
      tagSubfields: false,
      subfieldJoiner: ' '
    }, opts)

    if (this.vars().length) {
      var vals = this.vars().filter((f) => f['marcTag'] === `${marc}`).map((f) => {
        if (subfields) {
          var ret = (f['subFields'] || []).filter((sub) => subfields.indexOf(sub['tag']) >= 0)

          if (opts.tagSubfields) {
            return ret.reduce((hash, sub) => {
              hash[sub['tag']] = sub['content']
              return hash
            }, {})
          } else {
            return ret.map((sub) => sub['content']).join(opts.subfieldJoiner)
          }
        } else {
          return f['content'] || (f['subFields'] ? f['subFields'].map((sub) => sub['content']).join(opts.subfieldJoiner) : null)
        }
      })
      return [].concat.apply([], vals).filter((v) => v)
    }
  }
}

SierraRecord.from = (record) => {
  return new SierraRecord(record)
}

module.exports = { SierraRecord }
