const syncRequest = require('sync-request')

let _file_cache = {}

class FieldMapper {
  constructor (type, data) {
    this.type = type
    this.data = data
  }

  getMapping (field, cb) {
    if (Object.keys(this.data).indexOf(field) < 0) throw new Error('Invalid ' + this.type + ' field: ' + field + ': ' + Object.keys(this.data))

    if (cb) {
      cb(this.data[field])
    }
    return this.data[field]
  }

  predicateFor (field) {
    var spec = this.getMapping(field)
    return spec.pred
  }

  allPredicates () {
    // Get all referenced predicates:
    let preds = Object.keys(this.data)
      .map((fieldLabel) => this.predicateFor(fieldLabel))
    // Unique them:
    return Object.keys(preds.reduce((h, p) => {
      h[p] = true
      return h
    }, {}))
  }
}

// Syncronously fetch url, caching it for subsequent "requires"
function requireRemote (url) {
  if (!_file_cache[url]) {
    let res = syncRequest('GET', url)
    _file_cache[url] = JSON.parse(res.getBody('utf8'))
  }
  return _file_cache[url]
}

// Utility function, returns true if nyplSource matches any of the given nyplSources patterns
var sourceMatches = (nyplSource, sourcePatterns) => {
  return sourcePatterns.filter((pattern) => {
    return pattern === '*' || pattern === nyplSource
  }).length > 0
}

// Takes a mappings doc and an nyplSource and removes any mappings paths that
// are invalid based on the nyplSource
var amendMappingsBasedOnNyplSource = (data, nyplSource) => {
  return Object.keys(data).reduce((m, name) => {
    var revised = Object.assign({}, data[name])
    if (revised.paths) {
      // Remove unmatching paths:
      revised.paths = revised.paths.reduce((a, p) => {
        if (!p.nyplSources || (Array.isArray(p.nyplSources) && sourceMatches(nyplSource, p.nyplSources))) a.push(p)
        return a
      }, [])
    }
    m[name] = revised
    return m
  }, {})
}

/**
 * Returns a field mapper instance for the given type (bib/item) and nyplSource (optional)
 *
 * @param {string} type - Specify mapper type: Either 'bib' or 'item.
 * @param {string} [nyplSource] - Specify nyplSource to amend mappings, e.g. sierra-nypl, recap-pul
 *
 * @return {function} A builder function that returns an instance of FieldMapper
 *
 * @example
 * // Returns a bib fieldmapper:
 * require('./field-mapper')('bib')
 *
 * @example
 * // Returns an item fieldmapper:
 * require('./field-mapper')('item')
 *
 * @example
 * // Returns an item fieldmapper specific to sierra-nypl:
 * require('./field-mapper')('item', 'sierra-nypl')
 */
function buildMapper (type, nyplSource) {
  if (['bib', 'item'].indexOf(type) >= 0) {
    let data = requireRemote(`https://raw.githubusercontent.com/NYPL/nypl-core/${process.env.NYPL_CORE_VERSION || 'v1.4a'}/mappings/recap-discovery/field-mapping-${type}.json`)

    // If nyplSource given, trim mappings to agree with it:
    if (nyplSource) data = amendMappingsBasedOnNyplSource(data, nyplSource)

    return new FieldMapper(type, data)
  } else throw new Error('Unrecognized field-mapper type: ' + type)
}

module.exports = buildMapper
