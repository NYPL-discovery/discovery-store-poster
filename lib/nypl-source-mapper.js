const syncRequest = require('sync-request')

class NyplSourceMapper {
  constructor (nyplSourceMapping) {
    this.nyplSourceMapping = nyplSourceMapping
  }

  /**
   *  Given a discovery identifier (aka "uri"),
   *  e.g. "b12082323", "i123456", "pb98766", "ci2342343"
   *
   *  Returns a hash with:
   *   - `nyplSource`: System/institution identifier. One of sierra-nypl,
   *                   recap-pul, recap-cul, recap-hl
   *   - `type`: Record type. One of bib, item, holding
   *   - `id`: The non-prefixed identifier, e.g. "12082323"
   */
  splitIdentifier (prefixedIdentifier) {
    if (!/^[a-z]+/.test(prefixedIdentifier)) return null

    const prefix = prefixedIdentifier.match(/^[a-z]+/)[0]
    const mapping = Object.keys(this.nyplSourceMapping)
      .map((nyplSource) => Object.assign({}, { nyplSource }, this.nyplSourceMapping[nyplSource]))
      .find((properties) => {
        return [properties.bibPrefix, properties.itemPrefix].includes(prefix)
      })
    const type = mapping.bibPrefix === prefix ? 'bib' : 'item'

    return {
      nyplSource: mapping.nyplSource,
      type,
      id: prefixedIdentifier.replace(prefix, '')
    }
  }
}

let nyplSourceMappingData = null

NyplSourceMapper.instance = () => {
  if (!nyplSourceMappingData) {
    const res = syncRequest('GET', `https://raw.githubusercontent.com/NYPL/nypl-core/${process.env.NYPL_CORE_VERSION || 'master'}/mappings/recap-discovery/nypl-source-mapping.json`)
    nyplSourceMappingData = JSON.parse(res.getBody('utf8'))
  }
  return new NyplSourceMapper(nyplSourceMappingData)
}

module.exports = NyplSourceMapper
