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

  isNyplRecord () {
    return !this.isPartnerRecord()
  }

  isPartnerRecord () {
    // Presently matches known partner sources: recap-pul and recap-cul:
    return this.nyplSource && /^recap-[pc]/.test(this.nyplSource)
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
    return this._fixedMap[label]
  }

  // Get marc field segment (e.g. varFieldSegment('008', [35, 37]) => 'eng')
  varFieldSegment (marc, range) {
    var values = this.varField(marc)
    if (values && values.length > 0) {
      if (values[0].length >= range[1]) {
        // Note: ranges are generally specified inclusive, so ending index should add 1
        return values[0].substring(range[0], range[1] + 1)
      }
    }
  }

  query (path, opts) {
    if (/^\d+$/.test(path)) {
      return this.varField(path, null, opts)
    } else if (/^\d+ \$\w/.test(path)) {
      var marc = path.split(' ')[0]
      var subfields = path.split(' ').slice(1).map((f) => f.replace('$', ''))
      return this.varField(marc, subfields, opts)
    }
  }

  // Return content for given marc tag
  // if subfields given, returns content of those fields joined (or as a hash if opts.tagSubfields is truthy)
  // Options include:
  //  * tagSubfields: If true, returns a hash of subfield values (rather than joining the values in a single string)
  //  * subfieldJoiner: Character to join subfield values. Default ' '
  //  * preFilter: Optional function to filter out matching marc blocks before extracting value. Useful for checking atypical properties like `ind1`.
  varField (marc, subfields, opts) {
    var varFields = this._varFieldByMarcTag(marc)
    return this._extractValuesFromVarFields(varFields, subfields, opts)
  }

  fieldTag (field, subfields, opts) {
    var varFields = this._varFieldByFieldTag(field)
    return this._extractValuesFromVarFields(varFields, subfields, opts)
  }

  _varFieldByFieldTag (fieldTag) {
    return this.vars().filter((f) => !f['marcTag'] && f['fieldTag'] === `${fieldTag}`)
  }

  _varFieldByMarcTag (marc) {
    return this.vars().filter((f) => f['marcTag'] === `${marc}`)
  }

  _extractValuesFromVarFields (varFields, subfields, opts) {
    opts = opts || {}
    opts = Object.assign({
      tagSubfields: false,
      subfieldJoiner: ' ',
      preFilter: (block) => true
    }, opts)

    if (varFields.length) {
      var vals = varFields.filter(opts.preFilter).map((f) => {
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
    } else return []
  }
}

SierraRecord.from = (record) => {
  return new SierraRecord(record)
}

module.exports = SierraRecord
