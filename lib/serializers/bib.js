const flattenArray = require('../utils').flattenArray
const Statement = require('../models/statement')
const Creator = require('../models/creator')
const Datasource = require('../models/datasource')
const Lookup = require('../lookup')
const buildFieldMapper = require('../field-mapper')
const formattingUtils = require('./formatting-utils')
const utils = require('../utils')
const sierraLocationMapping = require('@nypl/nypl-core-objects')('by-sierra-location')

function InvalidInputError (message) {
  this.name = 'InvalidInputError'
  this.message = (message || '')
}
InvalidInputError.prototype = Error.prototype

var fromMarcJson = (object, datasource) => {
  if (!datasource) datasource = Datasource.byMarcJsonNyplSource(object.nyplSource)
  if (!datasource) throw new InvalidInputError('No datasource given (' + object.nyplSource + ')')

  try {
    var fieldMapper = buildFieldMapper('bib', object.nyplSource)

    var id = object.prefixedId()

    var builder = Statement.builder(id, Creator.CORE_SERIALIZER.id, { id: datasource.id, record_id: object.id })

    // Bnumber identifier
    builder.add(fieldMapper.predicateFor('Identifier'), { id: object.id, type: 'nypl:Bnumber' }, 0, { path: 'id' })

    // Title
    if (object.title) builder.add(fieldMapper.predicateFor('Title'), { literal: object.title }, 0, { path: 'title' })

    // Bib Suppression (due to having been deleted, being an OTF record, or
    // actual bib suppression)
    let suppressed = false
    let suppressedRationale = null
    if (object.suppressed || object.deleted || object.isOtfRecord()) {
      suppressed = true
      if (object.suppressed) suppressedRationale = 'suppressed'
      else if (object.deleted) suppressedRationale = 'deleted'
      else if (object.isOtfRecord()) suppressedRationale = 'is-otf'
    }
    builder.add(fieldMapper.predicateFor('Suppressed'), { literal: suppressed, type: 'xsd:boolean' }, 0, { path: suppressedRationale })

    // Even though the above require no lookups, make them a promise so they can be merged w/lookups below
    var promises = []

    // Language
    promises.push(Lookup.initialize('language-code-to-label').then((lookup) => {
      // First try 008/35-37
      var langs = []
      var lang = object.varFieldSegment('008', [35, 37])
      if (lang) langs.push({ lang, path: '008/35-37' })

      // TODO 041 has funny values. Check fixtures
      // If not found in 008, try 041 $f (may be mult)
      if (!lang) lang = object.varField('041', ['a'])
      if (lang) {
        langs = flattenArray([lang]).map((lang) => ({ lang, path: '041 $a' }))
      }

      if (langs) {
        // We have an array of lang objects with a lang (code), and a path
        // Sometimes one code contains 'ger ita'
        // Let's make sure in that case we have two langs:
        langs = langs.reduce((a, lang) => {
          return a.concat(lang.lang.split(' ').map((code, ind) => {
            return {
              lang: code,
              path: `${lang.path} (${ind})`
            }
          }))
        }, [])
        return langs.map((lang, index) => {
          var label = lookup.lookup(lang.lang)
          // For now only save language if lookup succeeds (If it doesn't it's probably an invalid identifier.)
          if (label) builder.add(fieldMapper.predicateFor('Language'), { id: `lang:${lang.lang}`, label: label }, index, { path: lang.path })
        })
      }
    }))

    // Bib Location(s)
    if (object.locations) {
      // Convert locations to array of entities with labels:
      const locationEntities = object.locations
        .map((location) => location.code)
        // Only use locations found in nypl-core:
        .filter((code) => sierraLocationMapping[code])
        .map((code) => {
          return {
            id: code,
            label: sierraLocationMapping[code].label
          }
        })

      // Add each location:
      locationEntities.forEach((holdingLocation, ind) => {
        const id = `loc:${holdingLocation.id}`
        const label = holdingLocation.label
        builder.add(fieldMapper.predicateFor('Catalog bib location code'), { id, label }, ind, { path: 'locations.code' })
      })
    }

    // Electronic resources (PDF URLs, etc)
    const eResources = extractElectronicResourcesFromBibMarc(object, 'Appendix')
    if (eResources && eResources.length > 0) {
      eResources.forEach((resource, index) => {
        builder.add('bf:supplementaryContent', { literal: resource.url, label: resource.label }, index, { path: resource.path })
      })
    }

    // Look up contrib literals by role:
    // Contributors with roles are found in these:
    ; [700, 710, 711].forEach((marc) => {
      // Grab these subfields ($e is where role is found)
      var matches = object.varField(marc, ['a', 'b', 'c', 'q', 'd', 'j', 'e'], { tagSubfields: true })
      matches.forEach((vals, ind) => {
        // Get role (this string varies considerably)
        var role = vals.e

        // Construct contrib literal from these subfields:
        var matchedSubfields = []
        var value = ['a', 'b', 'c', 'q', 'd', 'j'].reduce((_vals, sub) => {
          if (vals[sub]) {
            matchedSubfields.push(sub)
            _vals.push(vals[sub])
          }
          return _vals
        }, []).join(' ').trim()
        matchedSubfields.push('e')

        // If role found, match it against LOC roles: (also make sure value is truthy cause sometimes these fields are '')
        if (role && value) {
          promises.push(Lookup.initialize('agent-role-to-loc-role').then((lookup) => {
            role = lookup.lookup(role)
            // If LOC matched, build the statement:
            if (role) {
              // The index must be unique per predicate, so count how many already-added roles of this type across all mappings we've collected:
              var ind = (builder.getAll(`role:${role}`) || []).length
              builder.add(`role:${role}`, { literal: value }, ind, { path: `${marc} ${matchedSubfields.map((s) => `$${s}`).join(' ')}` })
            }
          }))
        }
      })
    })

    // Date start
    var dateStart = null
    if (object.publishYear) dateStart = { value: object.publishYear, path: 'publishYear' }
    else dateStart = { value: parseInt(object.varFieldSegment('008', [7, 10])), path: '008 $7 $10' }
    if (dateStart.value) {
      ; ['Date start', 'Date created', 'Date'].forEach((relationship) => {
        builder.add(fieldMapper.predicateFor(relationship), { literal: dateStart.value, type: 'xsd:integer' }, 0, { path: dateStart.path })
      })
    }

    // Genres? No mapping yet, but let's collect anyway
    var genres = object.varFieldSegment('008', [24, 27])
    if (genres) genres = genres.split('').filter((code) => code !== ' ')
    if (genres && genres.length > 0) {
      promises.push(Lookup.initialize('genre-code-to-label').then((lookup) => {
        genres.forEach((genre, ind) => {
          if (lookup.lookup(genre)) {
            builder.add('nypl:genre', { id: `genre:${genre}`, label: lookup.lookup(genre) }, ind, { path: '008/24-27' })
          }
        })
      }))
    }

    // Date end
    var dateEnd = parseInt(object.varFieldSegment('008', [11, 14]))
    if (dateEnd) {
      ; ['Date end'].forEach((relationship, ind) => {
        builder.add(fieldMapper.predicateFor(relationship), { literal: dateEnd, type: 'xsd:integer' }, ind, { path: '008/11-14' })
      })
    }

    // Parse a bunch of straightforwardly mapped literals:
    ; [
      'Alternative title',
      'Contents',
      'Contents title',
      'Contributor literal',
      'Creator literal',
      'Dates of serial publication',
      'Description',
      'Dimensions',
      'Donor/Sponsor',
      'Extent',
      'Former title',
      'LCC classification',
      'Place of publication',
      'Publication statement',
      'Publisher literal',
      'Series statement',
      'Title',
      'Title display',
      'Uniform title'
    ].forEach((name) => {
      // Get mapping by name:
      var fieldMapping = fieldMapper.getMapping(name)
      var index = 0
      fieldMapping.paths.forEach((path) => {
        // Extract value by marc & subfields
        // console.log('path: ', JSON.stringify(path, null, 2))
        var val = object.varField(path.marc, path.subfields, { excludedSubfields: path.excludedSubfields })

        // Build provo path
        var recordPath = path.marc
        if (path.subfields) recordPath += ' ' + path.subfields.map((s) => `$${s}`).join(' ')

        // Save one statement per value found:
        val.forEach((v) => {
          builder.add(fieldMapping.pred, { literal: v, label: path.description }, index, { path: recordPath })
          index += 1
        })
      })
    })

    // Notes
    var index = 0
    var noteMapping = fieldMapper.getMapping('Note')
    noteMapping.paths.forEach((path) => {
      // Extract value by marc & subfields
      const val = object.varField(path.marc, path.subfields, {
        preFilter: (block) => {
          // Notes should be suppressed if ind1 is '0'
          return block.ind1 !== '0'
        }
      })

      // Build provo path
      var recordPath = path.marc
      if (path.subfields) recordPath += ' ' + path.subfields.map((s) => `$${s}`).join(' ')

      // Save one statement per value found:
      val.forEach((v) => {
        // Build a "Note" blank node with three statements:
        const blankNode = {
          'rdf:type': { id: 'bf:Note' },
          'bf:noteType': { literal: path.description },
          'rdfs:label': { literal: v }
        }
        builder.addBlankNode(noteMapping.pred, blankNode, index, { path: recordPath })
        index += 1
      })
    })

    // Parse a bunch of straightforward identifiers:
    ; ['ISBN', 'ISSN', 'LCCN'].forEach((name) => {
      // Get mapping by name:
      var fieldMapping = fieldMapper.getMapping(name)
      fieldMapping.paths.forEach((path) => {
        // Extract value by marc & subfields
        var val = object.varField(path.marc, path.subfields)

        // Build provo path
        var recordPath = path.marc
        if (path.subfields) recordPath += ' ' + path.subfields.map((s) => `$${s}`).join(' ')

        // Save one statement per value found:
        val.forEach((id) => {
          const type = `bf:${utils.capitalize(name.toLowerCase())}`
          builder.add(fieldMapping.pred, { id, type }, null, { path: recordPath })
        })
      })
    })

    // Extract OCLC numbers:
    const oclcFieldMapping = fieldMapper.getMapping('OCLC number')
    oclcFieldMapping.paths.forEach((path) => {
      // Extract value by marc & subfields
      let vals = object.varField(path.marc, path.subfields)
      // Reject identifiers in 035 $a that aren't prefixed "(OCoLC)"
      if (path.marc === '035') {
        vals = vals.filter((id) => id.includes('(OCoLC)'))
          .map((id) => id.replace(/^\(OCoLC\)/, ''))
      }
      // Ensure all oclc numbers are non-empty:
      vals = vals.filter((v) => v)

      // Build provo path
      var recordPath = path.marc
      if (path.subfields) recordPath += ' ' + path.subfields.map((s) => `$${s}`).join(' ')

      vals.forEach((id) => {
        const type = 'nypl:Oclc'
        builder.add(oclcFieldMapping.pred, { id, type }, null, { path: recordPath })
      })
    })

    // Parse a bunch of generic bf:Identifier typed identifiers.
    // These are "Standard numbers" in Sierra parlance, which include
    // identifiers for different domains and classifications, which
    // we'd like to store and index, but for which we don't have a
    // rdf:type yet.
    var fieldMapping = fieldMapper.getMapping('Identifier')
    fieldMapping.paths.forEach((path) => {
      // Extract value by marc & subfields
      var val = object.varField(path.marc, path.subfields)

      // Build provo path
      var recordPath = path.marc
      if (path.subfields) recordPath += ' ' + path.subfields.map((s) => `$${s}`).join(' ')

      // Save one statement per value found:
      val.forEach((id) => {
        const type = 'bf:Identifier'
        // TODO: Better handle identifiers whose length exceeds 512 (column width is 512):
        if (id) id = id.substring(0, 512)
        builder.add(fieldMapping.pred, { id, type }, null, { path: recordPath })
      })
    })

    // Handle some cancelled/invalid identifier mappings:
    ; ['ISBN (Canceled/Invalid)', 'ISSN (Canceled)', 'ISSN (Incorrect)'].forEach((mappingName) => {
      fieldMapper.getMapping(mappingName, (fieldMapping) => {
        fieldMapping.paths.forEach((path) => {
          // Extract value by marc & subfields
          var val = object.varField(path.marc, path.subfields)

          // Build provo path
          var recordPath = path.marc
          if (path.subfields) recordPath += ' ' + path.subfields.map((s) => `$${s}`).join(' ')

          let type = null
          let identifierStatus = null
          // Determine type and identifierStatus based on mapping:
          switch (mappingName) {
            case 'ISBN (Canceled/Invalid)':
              type = 'bf:Isbn'
              identifierStatus = 'canceled/invalid'
              break
            case 'ISSN (Canceled)':
              type = 'bf:Issn'
              identifierStatus = 'canceled'
              break
            case 'ISSN (Incorrect)':
              type = 'bf:Issn'
              identifierStatus = 'incorrect'
              break
          }

          // Save one statement per value found:
          val.forEach((id, index) => {
            const blankNode = {
              'rdf:type': { id: type },
              'rdf:value': { literal: id },
              'bf:identifierStatus': { literal: identifierStatus }
            }
            builder.addBlankNode(fieldMapping.pred, blankNode, index, { path: recordPath })
          })
        })
      })
    })

    // Callnum
    var callnum = null
    if (object.varField('852', ['h'])) callnum = { value: object.varField('852', ['h'])[0], path: '852 $h' }
    if (!callnum) callnum = { value: object.callNumber, path: 'callNumber' }
    if (callnum && callnum.value) {
      // Pull callnumber suffix from fieldTag v if present
      var callnumSuffix = object.fieldTag('v')
      if (callnumSuffix && callnumSuffix.length) {
        callnum.value += ' ' + callnumSuffix[0]
        callnum.path += ', fieldTag v'
      }
      builder.add(fieldMapper.predicateFor('Call number'), { literal: callnum.value }, 0, { path: callnum.path })
    }

    // subjectLiteral formatter
    const formatSubjectLiteral = (hash) => {
      // Join one set of keys with spaces
      // and another set of keys with ' -- '
      return [
        formattingUtils.truthyValuesByKeys(hash, ['a', 'b', 'c', 'd', 'e', 'g', '4']).join(' '),
        formattingUtils.truthyValuesByKeys(hash, ['v', 'x', 'y', 'z']).join(' -- ')
      ]
        // If either set of values matched nothing, drop it:
        .filter((v) => v)
        // Join sets together with ' -- ':
        .join(' -- ')
    }

    // Subject literal
    fieldMapper.getMapping('Subject literal', (fieldMapping) => {
      fieldMapping.paths.forEach((path) => {
        // let formatter = (subfields) => Object
        const subjects = object.varField(path.marc, path.subfields, { tagSubfields: true })
        if (subjects && subjects.length > 0) {
          subjects.forEach((subject, ind) => {
            subject = formatSubjectLiteral(subject)
            if (subject) builder.add(fieldMapping.pred, { literal: subject }, null, { path: `${path.marc} ${(path.subfields || []).join(' ')}` })
          })
        }
      })
    })

    // Media type
    promises.push(object.mediaType().then((vals) => {
      if (vals) {
        vals.forEach((val, ind) => {
          builder.add(fieldMapper.predicateFor('Media type'), val.object, ind, { path: val.path })
        })
      }
    }))

    promises.push(object.carrierType().then((vals) => {
      if (vals) {
        vals.forEach((val, ind) => {
          builder.add(fieldMapper.predicateFor('Carrier type'), val.object, ind, { path: val.path })
        })
      }
    }))

    // Part of
    fieldMapper.getMapping('Part of', (fieldMapping) => {
      fieldMapping.paths.forEach((path) => {
        var partOfValues = object.varField(path.marc, path.subfields)
        if (partOfValues && partOfValues.length > 0) {
          partOfValues.forEach((partOfValue, index) => {
            builder.add(fieldMapping.pred, { literal: partOfValue }, index, { path: `${path.marc} ${path.subfields.join(' ')}` })
          })
        }
      })
    })

    // Add Genre/Form literal
    fieldMapper.getMapping('Genre/Form literal', (fieldMapping) => {
      fieldMapping.paths.forEach((path) => {
        var genreFormValues = object.varField(path.marc, path.subfields, { subfieldJoiner: ' – ' })
        if (genreFormValues && genreFormValues.length > 0) {
          genreFormValues.forEach((genreFormValue, index) => {
            const sourceRecordPath = `${path.marc} ${path.subfields.map((subfield) => `$${subfield}`).join(' ')}`
            builder.add(fieldMapping.pred, { literal: genreFormValue }, index, { path: sourceRecordPath })
          })
        }
      })
    })

    // Add various parallel literals:

    const parallelMappings = Object.values(fieldMapper.data).filter(mapping =>
      mapping.paths && mapping.paths.some(path => path.isParallelFor)
    )

    parallelMappings.forEach((fieldMapping) => {
      fieldMapping.paths.forEach((path) => {
        const parallelValues = object.parallel(path.isParallelFor, path.subfields || [])
        if (parallelValues && parallelValues.length > 0) {
          parallelValues.forEach((parallelValue) => {
            const sourceRecordPath = `880[$u^=${path.isParallelFor}] ${path.subfields.map((subfield) => `$${subfield}`).join(' ')}`
            builder.add(fieldMapping.pred, { literal: parallelValue || ' ' }, null, { path: sourceRecordPath })
          })
        }
      })
    })

    // LDR fields
    if (object.ldr()) {
      if (object.ldr().bibLevel) {
        promises.push(Lookup.initialize('bib-levels').then((lookup) => {
          var bibLevel = object.ldr().bibLevel
          if (bibLevel && bibLevel.trim()) builder.add(fieldMapper.predicateFor('Issuance'), { id: `urn:biblevel:${bibLevel.trim()}`, label: lookup.lookup(bibLevel) }, 0, { path: 'LDR/07' })
        }))
      }

      // Rec type
      // TODO: what's the interplay btw rectype (from ldr) and resource type (from fixed fields)
      if (object.ldr().recType) {
        promises.push(Lookup.initialize('rectypes-to-resource-types').then((lookup) => {
          var recType = object.ldr().recType
          var dcterm = lookup.lookup(recType)
          if (!dcterm) return Promise.resolve(null)

          return Lookup.initialize('resource-types').then((lookup) => {
            var label = lookup.lookup(dcterm)
            builder.add(fieldMapper.predicateFor('Resource type'), { id: `resourcetypes:${dcterm}`, label: label }, 0, { path: 'LDR/06' })
          })
        }))
      }

      // Await all resolution promises:
      return Promise.all(promises).then(() => {
        // Determine rdf:type
        // If LDR/07 (BIB LVL) == 'c' or 's' then nypl:Collection, else nypl:Item
        var type = 'nypl:Item'
        if (builder.get('bf:issuance') && ['urn:biblevel:c', 'urn:biblevel:s'].indexOf(builder.get('bf:issuance').object_id) >= 0) {
          type = 'nypl:Collection'
        }
        builder.add(fieldMapper.predicateFor('Type'), { id: type }, 0)

        return builder.statements
      })
    } else if (builder.statements.some((statement) => (statement.predicate === 'nypl:suppressed'))) {
      return Promise.resolve(builder.statements)
    }
  } catch (e) {
    return Promise.reject(e)
  }
}

/**
 * Given a MiJ bib and a e-resource type, returns extracted resources
 *
 * @param {object} bib Instance of BibSierraRecord
 * @param {string} type Type of resource to extract - either 'Appendix' or 'ER'
 *
 * @return {array} Array of objects representing electronic resources with following properties:
 * - url: URL of resoruce
 * - label: Label for resource if found
 * - path: "Path" to value in marc (for recording provo)
 */
var extractElectronicResourcesFromBibMarc = (bib, type) => {
  // Set up a filter to apply to 856 fields
  // Unless `type` set to ER or Appendix, our preFilter accepts all e-resources:
  let preFilter = (marcBlock) => true
  // Each 856 entry with ind2 of '0' or '1' is a Electronic Resource:
  if (type === 'ER') preFilter = (marcBlock) => ['0', '1'].indexOf(String(marcBlock.ind2)) >= 0
  // Each 856 entry with ind2 of '2' (or blank/unset) is "Appendix" (bib.supplementaryContent):
  if (type === 'Appendix') preFilter = (marcBlock) => !marcBlock.ind2 || String(marcBlock.ind2).trim() === '' || ['2'].indexOf(String(marcBlock.ind2)) >= 0

  // URLs and labels can be anywhere, so pass `null` subfields param to get them all
  var electronicStuff = bib.varField(856, null, { tagSubfields: true, preFilter })

  if (electronicStuff && electronicStuff.length > 0) {
    return electronicStuff.map((r) => {
      // Consider all subfield values:
      var values = Object.keys(r).map((k) => r[k])
      // Get the one that looks like a URL
      const isUrl = (v) => /^https?:/.test(v)
      var url = values.filter(isUrl)[0]
      // .. and choose the label from the longest value that isn't a URL
      var label = values.filter((v) => !isUrl(v)).sort((e1, e2) => e1.length > e2.length ? -1 : 1)[0]

      return url ? { url, label, path: '856' } : null
    }).filter((r) => r)
  }
}

module.exports = { fromMarcJson, extractElectronicResourcesFromBibMarc }
