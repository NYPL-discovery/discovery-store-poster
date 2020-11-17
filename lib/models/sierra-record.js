'use strict'

const log = require('loglevel')

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
    var val = this.vars().filter((v) => v.fieldTag === '_')[0]
    if (!val || !val.content) return null

    val = val.content
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

  /**
   * Get the 880 parallel fields for the given field.
   *
   * If there are no parallel fields, returns []
   *
   * Preserves primary-parallel index relationships, so if there are two
   * parallel fields corresponding to the primary values 0 and 2, this will
   * return an array with ['parallel for val 0', '', 'parallel for val 2']
   *
   * @example
   * // This returns the parallel titles as an array in the same order of the
   * // corresponding bib.literals('245', ..)
   * bib.parallels('245', ['a', 'b'])
   */
  parallel (field, subfields) {
    // Although we're querying into 880, first perform identical query against
    // linked tag (e.g. 490), including subfield 6:
    const primaryValues = this.varField(field, subfields.concat(['6']), { tagSubfields: true })
    const parallelValues = primaryValues
      .map((subfieldHash) => {
        // Grab subfield 6:
        const subfield6 = subfieldHash['6']
        // If there is no $6, intentionally add '' to returned array
        // because we presumably there's some primary value at this index,
        // which just doesn't have a corresponding parallel value.
        if (!subfield6) return ''

        // Parse subfield $6 into tag and number (e.g. 880 & 01 respectively)
        const parallelFieldLink = SierraRecord.parseParallelFieldLink(subfield6)
        // Subfield 6 should always contain a parsable link, but, make sure..
        if (!parallelFieldLink) return ''

        let direction = 'ltr'
        const parallelField = this.varField(parallelFieldLink.tag, subfields, {
          // Use preFilter so that we can filter on raw subfield data:
          preFilter: (block) => {
            // Establish the $u value we're looking for (e.g. 490-01)
            const uVal = `${field}-${parallelFieldLink.number}`

            // Looking for the one varfield matching the uVal:
            const subFields = block.subFields || block.subfields
            const subfield6 = (subFields.filter((s) => s.tag === '6').pop() || { content: '' }).content

            // If no $6, 880 is malformed; remove it
            if (!subfield6) return false

            const parallelFieldLink880 = SierraRecord.parseParallelFieldLink(subfield6)

            // If the value in this 880 $6 is malformed, don't consider this 880:
            if (!parallelFieldLink880) {
              log.warn(`Skipping one of the 880 values because "${subfield6}" is malformed`)
              return false
            }

            // If 880 $u includes a direction suffix, grab it:
            if (parallelFieldLink880.direction) direction = parallelFieldLink880.direction

            // 880 $6 values include extra info on end, so just match beginning
            return subfield6.indexOf(uVal) === 0
          }
        })

        // We've queried all matching parallel fields and there will be only
        // one (because we preFilter'd on $u === FIELD-NUM), so return the
        // only match (or undefined if for some reason the link is broken):
        const value = parallelField.pop()
        const directionControlPrefix = direction === 'rtl' ? '\u200F' : ''

        return value ? `${directionControlPrefix}${value}` : null
      })

    // Only return as many parallel values as necessary to preserve primary-
    // parallel index relationships: Starting with last value, trim values off
    // the end of the array until we find a non-empty parallel value:
    for (let i = parallelValues.length - 1; i >= 0; i--) {
      // If there's a parallel value at this index, stop slicing:
      if (parallelValues[i]) break
      // Pop a val off end because there are no truthy vals from this point on:
      parallelValues.pop()
    }

    return parallelValues
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
    return this.vars().filter((f) => !f.marcTag && f.fieldTag === `${fieldTag}`)
  }

  _varFieldByMarcTag (marc) {
    return this.vars().filter((f) => f.marcTag === `${marc}`)
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
        var _subFields = f.subFields || f.subfields

        // return subfields based on options
        var subfieldParse = (subs) => {
          if (opts.tagSubfields) {
            return subs.reduce((hash, sub) => {
              hash[sub.tag] = sub.content
              return hash
            }, {})
          } else {
            return subs.map((sub) => sub.content).join(opts.subfieldJoiner)
          }
        }

        // If asked to match certain subfields, return only those:
        if (subfields) {
          var subs = (_subFields || []).filter((sub) => subfields.indexOf(sub.tag) >= 0)
          return subfieldParse(subs)
        // Otherwise, attempt to return 'content', falling back on subfields' content:
        } else {
          return f.content || (_subFields ? subfieldParse(_subFields) : null)
        }
      })
      return [].concat.apply([], vals).filter((v) => v)
    } else return []
  }
}

SierraRecord.parseParallelFieldLink = function (subfield6) {
  // Subfield 6 has form "[varfield]-[number]..."
  // In 880 fields, it may include language and direction suffixes,
  //   e.g. "245-01/(2/r", "100-01/(3/r"
  // In primary field (e.g. 245 $u) it will be for ex. "245-01"
  const parallelFieldLinkParts = subfield6.match(/^(\d+)-(\d+)(\/([^/]+)\/(\w))?/)

  // This should never happen, but if $6 is malformed, return null:
  if (!parallelFieldLinkParts) return null

  // Get the marc tag linked to by this 880 (e.g. '245')
  const tag = parallelFieldLinkParts[1]
  // Get the specific occurence number of the link (e.g. '01', '02', etc):
  const number = parallelFieldLinkParts[2]

  // Read optional suffix. "r" indicates direction 'rtl'
  let direction = 'ltr'
  if (parallelFieldLinkParts.length === 6 && parallelFieldLinkParts[5] === 'r') direction = 'rtl'

  return {
    tag,
    number,
    direction
  }
}

SierraRecord.from = (record) => {
  return new SierraRecord(record)
}

module.exports = SierraRecord
