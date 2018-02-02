const flattenArray = require('../utils').flattenArray
const Statement = require('../models/statement')
const Creator = require('../models/creator')
const Datasource = require('../models/datasource')
const Lookup = require('../lookup')
const buildFieldMapper = require('../field-mapper') // .BibFieldMapper

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
    builder.add(fieldMapper.predicateFor('Identifier'), { id: `urn:bnum:${object.id}` }, 0, { path: 'id' })

    // Title
    if (object.title) builder.add(fieldMapper.predicateFor('Title'), { literal: object.title }, 0, { path: 'title' })

    // Suppressed
    builder.add(fieldMapper.predicateFor('Suppressed'), { literal: Boolean(object.suppressed || object.deleted), type: 'xsd:boolean' }, 0, { path: object.suppressed ? 'suppressed' : 'deleted' })

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

    // Electronic resources (PDF URLs, etc)
    let eResources = extractElectronicResourcesFromBibMarc(object, 'Appendix')
    if (eResources && eResources.length > 0) {
      eResources.forEach((resource, index) => {
        builder.add('bf:supplementaryContent', { literal: resource.url, label: resource.label }, index, { path: resource.path })
      })
    }

    // Contributors
    if (object.author) {
      flattenArray([object.author]).forEach((author, index) => {
        builder.add(fieldMapper.predicateFor('Contributor literal'), { literal: author, type: 'xsd:string' }, index, { path: 'author' })
      })
    }

    // Look up contrib literals by role:
    // Contributors with roles are found in these:
    ; [700, 710, 711].forEach((marc) => {
      // Grab these subfields ($e is where role is found)
      var matches = object.varField(marc, ['a', 'b', 'c', 'q', 'd', 'j', 'e'], { tagSubfields: true })
      matches.forEach((vals, ind) => {
        // Get role (this string varies considerably)
        var role = vals['e']

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
      'Contributor literal',
      'Creator literal',
      'Description',
      'Dimensions',
      'Extent',
      'LCC classification',
      'Place of publication',
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
        var val = object.varField(path.marc, path.subfields)

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
        val.forEach((v) => {
          let namespace = name.toLowerCase()
          builder.add(fieldMapping.pred, { id: `urn:${namespace}:${v}`, label: path.description }, null, { path: recordPath })
        })
      })
    })

    // Notes
    var index = 0
    var noteMapping = fieldMapper.getMapping('Note')
    noteMapping.paths.forEach((path) => {
      // Extract value by marc & subfields
      var val = object.varField(path.marc, path.subfields, { preFilter: (block) => {
        // Notes should be suppressed if ind1 is '0'
        return block.ind1 !== '0'
      }})

      // Build provo path
      var recordPath = path.marc
      if (path.subfields) recordPath += ' ' + path.subfields.map((s) => `$${s}`).join(' ')

      // Save one statement per value found:
      val.forEach((v) => {
        // builder.add(noteMapping.pred, { literal: v, label: path.description }, index, { path: recordPath })
        // TODO something like this: ...
        let blankNode = {
          'rdfs:type': { id: 'bf:Note' },
          'bf:noteType': { literal: path.description },
          'rdfs:label': { literal: v }
        }

        builder.addBlankNode(noteMapping.pred, blankNode, index, { path: recordPath })
        index += 1
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
      builder.add(fieldMapper.predicateFor('Call number'), { literal: callnum.value }, { path: callnum.path })
    }

    // Subject literal
    fieldMapper.getMapping('Subject literal', (fieldMapping) => {
      fieldMapping.paths.forEach((path) => {
        // We're querying for multiple subfields, which we want to join with ' -- '
        let subjects = object.varField(path.marc, path.subfields, { subfieldJoiner: ' -- ' })
        if (subjects && subjects.length > 0) {
          subjects.forEach((subject, ind) => {
            builder.add(fieldMapping.pred, { literal: subject }, ind, { path: `${path.marc} ${(path.subfields || []).join(' ')}` })
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
          partOfValues.forEach((partOfValue) => {
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
          genreFormValues.forEach((genreFormValue) => {
            let sourceRecordPath = `${path.marc} ${path.subfields.map((subfield) => `$${subfield}`).join(' ')}`
            builder.add(fieldMapping.pred, { literal: genreFormValue }, index, { path: sourceRecordPath })
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
      var url = values.filter((v) => v.indexOf('http:') === 0)[0]
      // .. and choose the label from the longest value that isn't a URL
      var label = values.filter((v) => v.indexOf('http:') !== 0).sort((e1, e2) => e1.length > e2.length ? -1 : 1)[0]

      return url && label ? { url, label, path: '856' } : null
    }).filter((r) => r)
  }
}

module.exports = { fromMarcJson, extractElectronicResourcesFromBibMarc }
