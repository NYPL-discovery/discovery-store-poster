'use strict'

const Datasource = require('./models/datasource')
const Statement = require('./models/statement')
const Creator = require('./models/creator')
const Shadowcat = require('./shadowcat')

const log = require('loglevel')

function fromMarcJson (bib, datasource) {
  if (!datasource) datasource = Datasource.byMarcJsonNyplSource(bib.nyplSource)
  if (!datasource) throw new Error('No datasource given')

  // Only care about sierra bibs:
  if ([Datasource.SIERRA_NYPL.id, Datasource.RECAP_NYPL.id].indexOf(datasource.id) < 0) return Promise.resolve([])

  // TODO do we need to parse prefix out of id for cases where we don't have datasource but do have a prefixed id? (i.e. after initial serialization)
  // var prefix = bib.id.match(/^[a-z]+/)[0]

  log.debug('ShadowcatRemediator#remediate: getting shadowcat bib: ', bib.id)

  // Strip prefix if found:
  var lookupId = parseInt(String(bib.id).replace(/^[a-z]+/, ''))

  return Shadowcat.bib(lookupId).then((shadowBib) => {
    if (!shadowBib) return []

    // TODO this is an absolute mess
    // For one, hathi:vols is an object with mult structured values, which we're just shoving in a literal
    log.trace('ShadowcatRemediator#remediate: got shadowcat bib: ', JSON.stringify(shadowBib, null, 2))

    var builder = Statement.builder(bib.prefixedId(), Creator.SHADOWCAT_REMEDIATOR.id, { id: Datasource.SHADOWCAT.id, record_id: bib.id })

    // Things to pull from shadowcat are registered here:
    // There's an array of things. For each thing, we define:
    //  - from: the property of the shadowcat document we want to pull data from, and
    //  - extract: a function that takes the value and returns an object with:
    //      - pred: the predicate to use for the statement
    //      - object: a hash with `id`, `literal`, `type`, etc
    ; [
        { from: 'classify:owi', extract: (val) => ({ pred: 'nypl:workId', object: { id: `urn:owi:${val}` } }) },
        { from: 'classify:oclc', extract: (val) => ({ pred: 'dcterms:identifier', object: { id: `urn:oclc:${val}` } }) },
        { from: 'classify:lcc', extract: (val) => ({ pred: 'dcterms:identifier', object: { id: `urn:lcc:${val}` } }) },
        { from: 'sc:lccCoarse', extract: (val) => ({ pred: 'dcterms:identifier', object: { id: `urn:lccCoarse:${val}` } }) },
        { from: 'hathi:id', extract: (val) => ({ pred: 'dcterms:identifier', object: { id: `urn:hathi:${val}` } }) },
        { from: 'hathi:vols', extract: (val) => ({ pred: 'hathi:vols', object: { literal: JSON.stringify(val) } }) },
        { from: 'hathi:access', extract: (val) => ({ pred: 'hathi:access', object: { literal: val, type: 'xsd:boolean' } }) }
    ].forEach((pred) => {
      var values = shadowBib[pred.from]
      if (!shadowBib[pred.from]) return
      if (typeof values !== 'object') values = [values]

      values.forEach((val) => {
        // Run property-specific extract function on the shadowcat doc property value:
        var extracted = pred.extract(val)

        // What predicate should we assign it to?
        var predicate = extracted.pred
        // What object data is extracted?
        var object = extracted.object
        // Make sure index is unique for this subject, predicate, & creator_id:
        var ind = (builder.getAll(predicate) || []).length

        // Register statement, marking the shadowcat doc property as the source path:
        builder.add(predicate, object, ind, { path: pred.from })
      })
    })

    return builder.statements
  })
}

module.exports = { fromMarcJson }
