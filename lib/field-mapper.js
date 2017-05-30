'use strict'

const BIB_MAPPING = require('../data/field-mapping-bib.json')
const ITEM_MAPPING = require('../data/field-mapping-item.json')

class FieldMapper {
  constructor (nyplSource) {
    this.nyplSource = nyplSource
  }

  predicateFor (name) {
    var spec = this.getMapping(name)
    if (spec) return spec.pred
  }
}

// Let's not build mappings twice needlessly
var __cache = {}

// Get a mapping config based on given nyplSource (invalid paths removed)
FieldMapper.buildMappingForNyplSource = function (type, nyplSource) {
  // If already built, return that:
  var cacheKey = [type, nyplSource].join('-')
  if (__cache[cacheKey]) return __cache[cacheKey]

  var mapping = null
  switch (type) {
    case 'bib': mapping = BIB_MAPPING; break
    case 'item': mapping = ITEM_MAPPING; break
  }

  // Utility function, returns true if nyplSource matches any of the given nyplSources patterns
  var sourceMatches = (sourcePatterns) => {
    return sourcePatterns.filter((pattern) => {
      return pattern === '*' || pattern === nyplSource
    }).length > 0
  }
  // Return a copy of the config with invalid paths removed
  __cache[cacheKey] = Object.keys(mapping).reduce((m, name) => {
    var revised = Object.assign({}, mapping[name])
    if (revised.paths) {
      // Remove unmatching paths:
      revised.paths = revised.paths.reduce((a, p) => {
        if (!p.nyplSources || (Array.isArray(p.nyplSources) && sourceMatches(p.nyplSources))) a.push(p)
        return a
      }, [])
    }
    m[name] = revised
    return m
  }, {})
  return __cache[cacheKey]
}

class BibFieldMapper extends FieldMapper {
  constructor (nyplSource) {
    super(nyplSource)

    this._mapping = FieldMapper.buildMappingForNyplSource('bib', nyplSource)
  }

  getMapping (name) {
    if (!this._mapping[name]) throw Error('Invalid mapping name: ' + name)
    return this._mapping[name]
  }
}

class ItemFieldMapper extends FieldMapper {
  constructor (nyplSource) {
    super(nyplSource)

    this._mapping = FieldMapper.buildMappingForNyplSource('item', nyplSource)
  }

  getMapping (name) {
    if (!this._mapping[name]) throw Error('Invalid mapping name: ' + name)
    return this._mapping[name]
  }
}

module.exports = { BibFieldMapper, ItemFieldMapper }
