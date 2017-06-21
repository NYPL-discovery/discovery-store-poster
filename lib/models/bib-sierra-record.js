'use strict'

const Promise = require('bluebird')

const Lookup = require('../lookup')
const SierraRecord = require('./sierra-record')

class BibSierraRecord extends SierraRecord {
  prefixedId () {
    var prefix = ''
    if (this.nyplSource && /recap-[PC]/.test(this.nyplSource)) {
      prefix = this.nyplSource.substring(6, 7).toLowerCase()
    }
    return `${prefix}b${this.id}`
  }

  materialTypeCode () {
    return this.fixed('Material Type')
  }

  carrierType () {
    // construct a suitable return object for the given fallback carriertype:
    var useDefault = function (id, path) {
      path = path || 'fixed "Material Type"'
      return Lookup.lookup('lc-carriertypes', id)
        .then((label) => {
          return [{
            object: { id: `carriertypes:${id}`, label },
            path
          }]
        })
    }
    // Returns a function that evaluates `val` and returns an object based on `id` if `val` is falsy
    var fallback = function (id) {
      return (val) => {
        if (val && val.length) return val
        else return useDefault(id)
      }
    }

    // Because they don't record Material Type in the same way,
    // for CUL/PUL, just pull 338 / 007, falling back on 'nc'
    if (/^recap-[PC]/.test(this.nyplSource)) return this.carrierTypeByVarField().then(fallback('nc'))

    // Based on Material Type pull carrier type from var fields or use default:
    switch (this.materialTypeCode()) {
      case '-': // MISC
      case '7': // TEACHER AUDIO
      case '8': // TEACHER SET
        return this.carrierTypeByVarField(['338']).then(fallback('zu'))
      case '3': // E-VIDEO:
        return useDefault('cr')
      case 'a': // BOOK/TEXT:
        return this.carrierTypeByVarField().then(fallback('nc'))
      case 'b': // BLU-RAY
      case 'v': // DVD
        return useDefault('vd')
      case 'e': // MAP
        return this.carrierTypeByVarField(['338']).then(fallback('nc'))
      case 'g': // FILM, SLIDE, ETC
        return this.carrierTypeByVarField(['007'])
      case 'h': // MICROFORM:
        return this.carrierTypeByVarField(['007']).then(fallback('hz'))
      case 'i': // SPOKEN WORD
      case 'j': // MUSIC NON-CD:
        return this.carrierTypeByVarField(['007']).then(fallback('sz'))
      case 'k': // PICTURE:
        return useDefault('nb')
      case 'm': // COMPUTER FILE!
        switch (this.varFieldSegment('007', [1, 1])) {
          case 'o': return useDefault('cd', '007/01')
          case 'r': return useDefault('cr', '007/01')
          default: return useDefault('cu')
        }
      case 'o': // KIT
      case 'p': // ARCHIVAL MIX
        return useDefault('nc')
      case 'z': // E-BOOK
      case 'w': // WEB RESOURCE
      case 'n': // E-AUDIOBOOK
        return useDefault('cr')
      case 'r': // 3-D OBJECT
      case 'x': // GAME
        return useDefault('nr')
      case 's': // VHS
        return useDefault('vf')
      case 't': // MANUSCRIPT
        return this.carrierTypeByVarField(['338']).then(fallback('nc'))
      case 'u': // AUDIOBOOK
      case 'y': // MUSIC CD
        return useDefault('sd')
      // c (SCORE), d (MANUSCRIPT MUS), l (LARGE PRINT), o (KIT), p (ARCHIVAL MIX)
      default:
        return useDefault('nc')
    }
  }

  mediaType () {
    // construct a suitable return object for the given fallback mediatype:
    var useDefault = function (id, path) {
      path = path || 'fixed "Material Type"'
      return Lookup.lookup('lc-mediatypes', id)
        .then((label) => {
          return [{
            object: { id: `mediatypes:${id}`, label },
            path
          }]
        })
    }
    // Returns a function that evaluates `val` and returns an object based on `id` if `val` is falsy
    var fallback = function (id) {
      return (val) => {
        if (val && val.length) return val
        else return useDefault(id)
      }
    }

    // Because they don't record Material Type in the same way,
    // for CUL/PUL, just pull 337 / 007, falling back on 'n'
    if (/^recap-[PC]/.test(this.nyplSource)) return this.mediaTypeByVarField().then(fallback('n'))

    // Based on Material Type pull media type from var fields or use default:
    switch (this.materialTypeCode()) {
      case '-': // MISC
      case '7': // TEACHER AUDIO
      case '8': // TEACHER SET
        return this.mediaTypeByVarField(['337']).then(fallback('z'))
      case '3': // E-VIDEO:
        return useDefault('c')
      case 'b': // BLU-RAY
      case 'v': // DVD
        return useDefault('v')
      case 'g': // FILM, SLIDE, ETC
        return this.mediaTypeByVarField(['007'])
      case 'h': // MICROFORM:
        return useDefault('h')
      case 'i': // SPOKEN WORD
      case 'j': // MUSIC NON-CD:
        return useDefault('s')
      case 'm': // COMPUTER FILE!
      case 'n': // E-AUDIOBOOK
      case 'z': // E-BOOK
      case 'w': // WEB RESOURCE
        return useDefault('c')
      case 's': // VHS
        return useDefault('v')
      case 't': // MANUSCRIPT
        return this.mediaTypeByVarField(['337']).then(fallback('nc'))
      case 'u': // AUDIOBOOK
      case 'y': // MUSIC CD
        return useDefault('s')
      // c (SCORE), d (MANUSCRIPT MUS), l (LARGE PRINT), o (KIT), p (ARCHIVAL MIX),
      // k (PICTURE), o (KIT), p (ACHIVAL MIX), r (3-D OBJECT), x (GAME), e (MAP),
      // a (BOOK/TEXT)
      default:
        return useDefault('n')
    }
  }

  mediaTypeByVarField (useStrategies) {
    useStrategies = useStrategies || ['337', '007']

    // Register a series of strategies for pulling media type:
    var strategies = {
      '007': () => {
        var seg = this.varFieldSegment('007', [0, 0])
        if (!seg) return Promise.resolve(null)

        return Lookup.lookup('lc-mediatypes', seg)
          .then((label) => {
            return [{
              object: { id: `mediatypes:${seg}`, label },
              path: '007/00'
            }]
          })
      },
      '337': () => {
        return new Promise((resolve, reject) => {
          var vals = this.varField('337', ['b', 'a'], { tagSubfields: true })
          if (vals) {
            return resolve(vals.map((val, ind) => {
              return {
                object: { id: `mediatypes:${val.b}`, label: val.a },
                path: '337 $b $a'
              }
            }))
          } else resolve(null)
        })
      }
    }

    // Collect strats to run:
    var stratToRun = useStrategies.map((name) => strategies[name]())
    // Iterate over them in sequence, returning first that's resolves something truthy
    return Promise.reduce(stratToRun, (previousVal, next) => {
      return previousVal || next
    }, null)
  }

  carrierTypeByVarField (useStrategies) {
    useStrategies = useStrategies || ['338', '007']

    // Register a series of strategies for pulling carrier type:
    var strategies = {
      '007': () => {
        var seg = this.varFieldSegment('007', [0, 1])
        if (!seg) return Promise.resolve(null)

        return Lookup.lookup('lc-carriertypes', seg)
          .then((label) => {
            return [{
              object: { id: `carriertypes:${seg}`, label },
              path: '007/00 + 007/01'
            }]
          })
      },
      '338': () => {
        return new Promise((resolve, reject) => {
          var vals = this.varField('338', ['b', 'a'], { tagSubfields: true })
          if (vals) {
            return resolve(vals.map((val, ind) => {
              return {
                object: { id: `carriertypes:${val.b}`, label: val.a },
                path: '338 $b $a'
              }
            }))
          } else resolve(null)
        })
      }
    }

    // Collect strats to run:
    var stratToRun = useStrategies.map((name) => strategies[name]())
    // Iterate over them in sequence, returning first that's resolves something truthy
    return Promise.reduce(stratToRun, (previousVal, next) => {
      return previousVal || next
    }, null)
  }
}

BibSierraRecord.from = (record) => {
  return new BibSierraRecord(record)
}

module.exports = BibSierraRecord
