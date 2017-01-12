const flattenArray = require('../utils').flattenArray
const Statement = require('../models').Statement
const Creator = require('../models').Creator
const Datasource = require('../models').Datasource
const Lookup = require('../lookup')
const FieldMapping = require('../field-mapping').FieldMapping
const MarcMapping = require('../field-mapping').MarcMapping

var sourcePrefix = (object) => {
  return object.nyplSource && object.nyplSource.match(/recap-[PC]/) ? object.nyplSource.substring(6, 7).toLowerCase() : ''
}

var fromMarcJson = (object, datasource) => {
  if (!datasource) datasource = Datasource.byMarcJsonNyplSource(object.nyplSource)
  if (!datasource) throw new Error('No datasource given')

  try {
    return FieldMapping.initialize('resources').then((fieldMapper) => {
      var id = `${sourcePrefix(object)}b${object.id}`

      var builder = Statement.builder(id, Creator.CORE_SERIALIZER.id, { id: datasource.id, record_id: object.id })

      builder.add('rdf:type', { id: 'nypl:Bib' })

      // Bnumber identifier
      builder.add(fieldMapper.predicateFor('Identifier'), { id: `urn:bnum:${object.id}` }, 0, { path: 'id' })

      // Title
      if (object.title) builder.add(fieldMapper.predicateFor('Title'), { literal: object.title }, 0, { path: 'title' })

      // Suppressed
      builder.add(fieldMapper.predicateFor('Suppressed'), { literal: object.suppressed && true, type: 'xsd:boolean' }, 0, { path: 'suppressed' })

      // Even though the above require no lookups, make them a promise so they can be merged w/lookups below
      var promises = []

      // Language
      promises.push(Lookup.initialize('language-code-to-label').then((lookup) => {
        // First try 008/35-37
        var langs = []
        var lang = false // object.varFieldSegment('008', [35, 37])
        if (lang) langs.push({ lang, path: '008/35-37' })

        // If not found in 008, try 041 $f (may be mult)
        if (!lang) lang = object.varField('041', ['a'])
        if (lang) {
          langs = flattenArray([lang]).map((lang) => ({ lang, path: '041 $a' }))
        }

        if (langs) {
          langs.forEach((lang, index) => {
            builder.add(fieldMapper.predicateFor('Language'), { id: `lang:${lang.lang}`, label: lookup.lookup(lang.lang) }, index, { path: lang.path })
          })
        }
      }))

      // Electronic resources (PDF URLs, etc)
      promises.push(extractElectronicResourcesFromBibMarc(object).then((resources) => {
        if (!resources) return Promise.resolve()

        // If none of the electronic resources are deemed ER (i.e. they're appendices/TOC, etc), don't create item
        resources = resources.filter((r) => r.type === 'Appendix')
        if (resources.length === 0) return Promise.resolve()

        resources.forEach((resource, index) => {
          builder.add('bf:supplementaryContent', { literal: resource.url, label: resource.label }, index, { path: resource.path })
        })
      }))

      // Contributors
      if (object.author) {
        flattenArray([object.author]).forEach((author, index) => {
          builder.add(fieldMapper.predicateFor('Contributor literal'), { literal: author, type: 'xsd:string' }, index, { path: 'author' })
        })
      }

      // Date start
      var dateStart = null
      if (object.publishYear) dateStart = { value: object.publishYear, path: 'publishYearh' }
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

      // Parse var fields
      promises.push(MarcMapping.initialize().then((marcMapper) => {
        marcMapper.allMappings(object.nyplSource).filter((mapping) => {
          // Don't pull these from marc cause we already have them (or handled below)
          // TODO fix 'Contributor by role', 'Contributor literal by role', whose predicate is conditional based on content
          // TODO Media type has two very diff mappings, so must parse manually
          return ['Contributor by role', 'Contributor literal by role', 'Media type', 'Subject', 'Subject literal', 'Carrier type', 'Type', 'Availability', 'Barcode', 'Call number', 'Date', 'Date created', 'Date start', 'Date end', 'Language'].indexOf(mapping.name) < 0
        }).map((mapping) => {
          // Override: Subjects coming out of Sierra are actually just literals
          if (mapping.name === 'Contributor') mapping.predicate = 'dc:contributor'
          if (mapping.name === 'Publisher') mapping.predicate = 'nypl:role-publisher'
          return mapping
        }).forEach((mapping) => {
          mapping.marcs.forEach((marc) => {
            var values = null
            values = object.varField(marc.marc, marc.subfields)
            // If recap, check additional marc mapping:
            if (object.nyplSource !== 'sierra-nypl' && (!values || values.length === 0)) values = object.varField(marc.recapMarc, marc.subfields)

            // if (values && values.length) console.log('matched: ', values, marc)
            // if (mapping.predicate === 'bf:dimensions') console.log('PROVO: ', provo)
            if (values && values.length) {
              values.forEach((value, ind) => {
                var path = marc.marc + (marc.subfields ? ' ' + marc.subfields.map((f) => `$${f}`).join(' ') : '')
                builder.add(mapping.predicate, { literal: value, label: marc.description }, ind, { path })
              })
            }
          })
        })

        ; ['600', '610', '611', '630', '648', '650', '651', '653', '655'].forEach((marc) => {
          var vals = object.varField(marc, null, { subfieldJoiner: ' -- ' })
          if (vals) {
            var predicate = 'dc:subject'
            vals.forEach((val, ind) => {
              builder.add(predicate, { literal: val }, ind, Object.assign({ path: marc }))
            })
          }
        })

        var values = null
        var mapping = null

        // Carrier type
        if (object.varField(338, ['b', 'a'])) {
          values = object.varField('338', ['b', 'a'], { tagSubfields: true })
          mapping = marcMapper.specFor('Carrier type')
          // console.log('carrier: ', values)
          if (mapping) {
            values.forEach((val, ind) => {
              builder.add(mapping.predicate, { id: `carriertypes:${val.b}`, label: val.a }, ind, { path: '338 $b $a' })
            })
          }
        }

        // Media type
        if (object.varField(337, ['b', 'a'])) {
          values = object.varField('337', ['b', 'a'], { tagSubfields: true })
          // mapping = marcMapper.specFor('Media type')
          // if (mapping) {
          // TODO matches multiple, so currently failing..
          values.forEach((val, ind) => {
            builder.add('bf:media', { id: `mediatypes:${val.b}`, label: val.a }, ind, { path: '337 $b $a' })
          })
          // }
        }
      }))

      // Fixed fields
      // Material type
      // if (this.object.fixed('Material Type')) {
        // NOTE Redundant, cause pulling it from ldr below
        // this.addStatement(fieldMapper.predicateFor('Resource type'), { objectUri: `urn:resourcetypes:${this.object.fixed('Material Type')}` })
      // }

      // LDR fields
      if (object.ldr()) {
        if (object.ldr().bibLevel) {
          promises.push(Lookup.initialize('bib-levels').then((lookup) => {
            var bibLevel = object.ldr().bibLevel
            builder.add(fieldMapper.predicateFor('Issuance'), { id: `urn:biblevel:${bibLevel}`, label: lookup.lookup(bibLevel) }, 0, { path: 'LDR/07' })
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
      }

      return Promise.all(promises).then(() => builder.statements)
    })
  } catch (e) {
    return Promise.reject(e)
  }
}

// Given a MiJ bib, returns an array of objects representing electronic resources with following properties:
//   - url: URL of resoruce
//   - label: Label for resource if found
//   - path: Path used to data
var extractElectronicResourcesFromBibMarc = (bib) => {
  // URLs and labels can be anywhere, so pass `null` subfields param to get them all
  var electronicStuff = bib.varField(856, null, { tagSubfields: true })

  if (electronicStuff && electronicStuff.length > 0) {
    var eResources = electronicStuff.map((r) => {
      // Consider all subfield values:
      var values = Object.keys(r).map((k) => r[k])
      // Get the one that looks like a URL
      var url = values.filter((v) => v.indexOf('http:') === 0)[0]
      // .. and choose the label from the longest value that isn't a URL
      var label = values.filter((v) => v.indexOf('http:') !== 0).sort((e1, e2) => e1.length > e2.length ? -1 : 1)[0]
      // console.log('got stuff: ', url, label)

      return url && label ? { url, label, path: '856' } : null
    }).filter((r) => r)

    // Load lookup file mapping common ER labels to 'ER'/'Appendix'
    return Lookup.initialize('856-label-to-resource-class').then((lookup) => {
      // Only keep resources whose label we know means they're a legit ER
      eResources = eResources.map((r) => {
        r.type = lookup.lookup(r.label)
        return r
      })

      return Promise.resolve(eResources)
    })
  }
  return Promise.resolve(null)
}

module.exports = { fromMarcJson, extractElectronicResourcesFromBibMarc }
